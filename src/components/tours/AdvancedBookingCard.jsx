import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { Edit2, Trash2 } from 'lucide-react';
import { bookVehicleForTour } from '../../store/slices/vehiclesSlice';
import { createTourBooking } from '../../store/slices/toursSlice';
import { useFleetAvailability } from '../../hooks/useFleetAvailability';
import FleetStatusIndicator from '../fleet/FleetStatusIndicator';
import QuadSelectionModal from './QuadSelectionModal';
import toast from 'react-hot-toast';

const AdvancedBookingCard = ({ 
  tour, 
  onQuantityChange, 
  onBookingSubmit,
  onEditTour,
  onDeleteTour,
  showAdminActions = false,
  initialQuantity = 1 
}) => {
  console.log('🔍 AdvancedBookingCard.jsx - received tour:', tour);
  console.log('🔍 AdvancedBookingCard.jsx - tour.location:', tour.location);
  
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [participants, setParticipants] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQuadSelection, setShowQuadSelection] = useState(false);
  const [quadSelection, setQuadSelection] = useState(null);
  const [maxParticipants, setMaxParticipants] = useState(8); // Default max participants

  const { fleetStatus } = useFleetAvailability();
  const fullAuthState = useSelector(state => state.auth);
  const { user, userRoles } = fullAuthState;
  
  // 🚨 COMPREHENSIVE Debug logging for role detection
  console.log('🚨 AdvancedBookingCard DEBUG - Full Auth State:', fullAuthState);
  console.log('🚨 AdvancedBookingCard DEBUG - User object:', user);
  console.log('🚨 AdvancedBookingCard DEBUG - UserRoles array:', userRoles);
  console.log('🚨 AdvancedBookingCard DEBUG - User email:', user?.email);
  
  // Multiple approaches to check edit access for "demo owner"
  const hasEditAccess1 = user && (user.role === 'owner' || user.role === 'admin');
  const hasEditAccess2 = userRoles && (userRoles.includes('owner') || userRoles.includes('admin'));
  const hasEditAccess3 = user?.email === 'owner_demo@saharax.com' || user?.email === 'owner@saharax.com';
  const hasEditAccess4 = userRoles && userRoles.some(role => 
    role && (role.toLowerCase().includes('owner') || role.toLowerCase().includes('admin'))
  );
  
  // Final combined access check - ANY of these should grant access
  const hasEditAccess = hasEditAccess1 || hasEditAccess2 || hasEditAccess3 || hasEditAccess4;
  
  console.log('🚨 AdvancedBookingCard DEBUG - hasEditAccess1 (user.role):', hasEditAccess1);
  console.log('🚨 AdvancedBookingCard DEBUG - hasEditAccess2 (userRoles):', hasEditAccess2);
  console.log('🚨 AdvancedBookingCard DEBUG - hasEditAccess3 (email check):', hasEditAccess3);
  console.log('🚨 AdvancedBookingCard DEBUG - hasEditAccess4 (includes):', hasEditAccess4);
  console.log('🚨 AdvancedBookingCard DEBUG - FINAL hasEditAccess:', hasEditAccess);

  // Handle date/time selection and proceed to quad selection
  const handleDateTimeNext = () => {
    if (selectedDate && selectedTime) {
      setShowQuadSelection(true);
    }
  };

  // Handle quad selection confirmation
  const handleQuadSelection = (selection) => {
    setQuadSelection(selection);
    setMaxParticipants(selection.totalParticipants);
    // Initialize participants array based on quad selection
    const initialParticipants = [];
    selection.selectedQuads.forEach((quad, quadIndex) => {
      for (let i = 0; i < quad.participantCount; i++) {
        initialParticipants.push({
          id: `${quad.quadId}_${i}`,
          quadId: quad.quadId,
          quadName: quad.quadName,
          name: '',
          age: '',
          email: '',
          phone: '',
          emergencyContact: ''
        });
      }
    });
    setParticipants(initialParticipants);
    setCurrentStep(2);
  };

  // Handle participant data changes
  const handleParticipantChange = (id, field, value) => {
    setParticipants(prevParticipants =>
      prevParticipants.map(participant =>
        participant.id === id ? { ...participant, [field]: value } : participant
      )
    );
  };

  // Add participant (only if under quad limits)
  const addParticipant = () => {
    if (participants.length < maxParticipants) {
      // Find a quad that can accommodate more participants
      const availableQuad = quadSelection?.selectedQuads.find(quad => {
        const currentCount = participants.filter(p => p.quadId === quad.quadId).length;
        return currentCount < quad.participantCount;
      });

      if (availableQuad) {
        setParticipants([...participants, {
          id: Date.now(),
          quadId: availableQuad.quadId,
          quadName: availableQuad.quadName,
          name: '',
          age: '',
          email: '',
          phone: '',
          emergencyContact: ''
        }]);
      }
    }
  };

  // Remove participant
  const removeParticipant = (id) => {
    setParticipants(participants.filter(participant => participant.id !== id));
  };

  // Validate form
  const validateForm = () => {
    if (!selectedDate || !selectedTime) {
      toast.error('Please select date and time');
      return false;
    }

    if (!quadSelection || quadSelection.selectedQuads.length === 0) {
      toast.error('Please select quads for your tour');
      return false;
    }

    if (participants.length === 0) {
      toast.error('Please add at least one participant');
      return false;
    }

    const invalidParticipants = participants.filter(p => !p.name.trim());
    if (invalidParticipants.length > 0) {
      toast.error('Please fill in all participant names');
      return false;
    }

    return true;
  };

  // Submit booking
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    
    try {
      // Create tour booking with quad assignments
      const tourBookingData = {
        tourId: tour.id,
        tourName: tour.name,
        selectedDate,
        selectedTime,
        participants,
        quadSelection,
        totalAmount: tour.price * participants.length,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };

      const tourBooking = await dispatch(createTourBooking(tourBookingData)).unwrap();
      
      // Book the selected vehicles for tour
      const vehicleIds = quadSelection.selectedQuads.map(quad => quad.quadId);
      
      await dispatch(bookVehicleForTour({
        vehicleIds,
        tourBooking: {
          ...tourBookingData,
          id: tourBooking.id
        }
      })).unwrap();

      toast.success(`Tour booked successfully! ${quadSelection.totalQuads} quads reserved for ${participants.length} participants.`);
      
      // Reset form
      setSelectedDate('');
      setSelectedTime('');
      setParticipants([]);
      setQuadSelection(null);
      setMaxParticipants(8);
      setCurrentStep(1);
      
    } catch (error) {
      console.error('Booking failed:', error);
      toast.error('Failed to book tour. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get minimum date (today)
  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  return (
    <div className="bg-white rounded-lg shadow-md border hover:shadow-lg transition-shadow relative">
      {/* PROMINENT EDIT BUTTON - Top Right Corner */}
      {hasEditAccess && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onEditTour) onEditTour(tour);
          }}
          className="absolute top-4 right-4 z-10 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
          title="Edit Tour"
        >
          <Edit2 className="w-5 h-5" />
        </button>
      )}
      
      {/* Tour Header */}
      <div className="p-6 pr-16">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{tour.name}</h3>
            <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
              {tour.type} Tour
            </span>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">${tour.price}</div>
            <div className="text-sm text-gray-500">per person</div>
          </div>
        </div>

        {/* Tour Details */}
        <div className="space-y-3 text-sm text-gray-600 mb-6">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{tour.duration}</span>
          </div>
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{tour.location}</span>
          </div>
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Max {tour.maxParticipants} participants</span>
          </div>
        </div>

        <p className="text-gray-600 mb-6">{tour.description}</p>

        {/* Booking Form */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h4 className="font-semibold text-lg">Select Date & Time</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tour Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={getMinDate()}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Time
                </label>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select time</option>
                  {(() => {
                    const timeSlots = [];
                    for (let hour = 7; hour <= 22; hour++) {
                      // Add :00 slot for every hour
                      const hourStr = hour.toString().padStart(2, '0');
                      timeSlots.push(
                        <option key={`${hourStr}:00`} value={`${hourStr}:00`}>
                          {hour <= 12 ? `${hourStr}:00 ${hour === 12 ? 'PM' : 'AM'}` : `${(hour - 12).toString().padStart(2, '0')}:00 PM`}
                        </option>
                      );
                      
                      // Add :30 slot for every hour except 22:00 (no 22:30)
                      if (hour < 22) {
                        timeSlots.push(
                          <option key={`${hourStr}:30`} value={`${hourStr}:30`}>
                            {hour <= 11 ? `${hourStr}:30 ${hour < 12 ? 'AM' : 'PM'}` : hour === 12 ? `${hourStr}:30 PM` : `${(hour - 12).toString().padStart(2, '0')}:30 PM`}
                          </option>
                        );
                      }
                    }
                    return timeSlots;
                  })()}
                </select>
              </div>
            </div>

            <button
              onClick={handleDateTimeNext}
              disabled={!selectedDate || !selectedTime}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Next: Select Quads
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => {
                  setCurrentStep(1);
                  setQuadSelection(null);
                  setParticipants([]);
                }}
                className="flex items-center text-blue-600 hover:text-blue-700"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Date & Time
              </button>
              <div className="text-sm text-gray-600">
                Selected: {selectedDate} at {selectedTime}
                {quadSelection && (
                  <div className="text-xs text-blue-600 mt-1">
                    {quadSelection.totalQuads} quads • Max {quadSelection.totalParticipants} participants
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">Add Participants</h3>
              <span className="text-sm text-gray-600">
                {participants.length}/{maxParticipants} participants
              </span>
            </div>

            {/* Quad Assignment Summary */}
            {quadSelection && (
              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <h4 className="font-semibold text-blue-900 mb-2">Quad Assignments</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {quadSelection.selectedQuads.map((quad, index) => (
                    <div key={quad.quadId} className="bg-white p-3 rounded border">
                      <div className="font-medium text-gray-900">{quad.quadName}</div>
                      <div className="text-sm text-gray-600">
                        {quad.participantCount} participant{quad.participantCount > 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-blue-600 mt-1">
                        {participants.filter(p => p.quadId === quad.quadId).length} assigned
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participants List */}
            <div className="space-y-4">
              {participants.map((participant, index) => (
                <div key={participant.id} className="border border-gray-200 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h4 className="font-medium">Participant {index + 1}</h4>
                      {participant.quadName && (
                        <p className="text-sm text-blue-600">Assigned to: {participant.quadName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeParticipant(participant.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={participant.name}
                        onChange={(e) => handleParticipantChange(participant.id, 'name', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter full name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Age
                      </label>
                      <input
                        type="number"
                        value={participant.age}
                        onChange={(e) => handleParticipantChange(participant.id, 'age', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Age"
                        min="1"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={participant.email}
                        onChange={(e) => handleParticipantChange(participant.id, 'email', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Email address"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={participant.phone}
                        onChange={(e) => handleParticipantChange(participant.id, 'phone', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Phone number"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addParticipant}
              disabled={participants.length >= maxParticipants}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Participant {participants.length < maxParticipants && `(${maxParticipants - participants.length} remaining)`}
            </button>

            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={participants.length === 0 || isSubmitting}
                className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Booking...' : `Book Tour - $${(tour.price * participants.length).toFixed(2)}`}
              </button>
            </div>
          </div>
        )}

        {/* Fleet Status Indicator */}
        <div className="mt-6">
          <FleetStatusIndicator />
        </div>

        {/* Quad Selection Modal */}
        <QuadSelectionModal
          isOpen={showQuadSelection}
          onClose={() => setShowQuadSelection(false)}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          duration={4}
          location={tour.location}
          onQuadSelection={handleQuadSelection}
          maxParticipants={8}
        />
      </div>
    </div>
  );
};

export default AdvancedBookingCard;