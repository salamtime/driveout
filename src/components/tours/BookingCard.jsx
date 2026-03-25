import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { MapPin, Clock, Users, DollarSign, Plus, Minus, ChevronDown, ChevronUp, Calendar, Edit2, Trash2 } from 'lucide-react';
import { usePricing } from '../../contexts/PricingContext';
import TourPricingCalculator from './TourPricingCalculator';
import { getEmergencyPrices } from '../common/EmergencyPriceProvider';

const BookingCard = ({ 
  tour, 
  onQuantityChange, 
  onBookingSubmit,
  onEditTour,
  onDeleteTour,
  showAdminActions = false,
  initialQuantity = 1 
}) => {
  const fullAuthState = useSelector(state => state.auth);
  const { user, userRoles } = fullAuthState;
  const { pricingEnabled } = usePricing();
  
  // COMPREHENSIVE Debug logging for role detection
  console.log('🚨 CRITICAL DEBUG - Full Redux Auth State:', fullAuthState);
  console.log('🚨 DEBUG - User object:', user);
  console.log('🚨 DEBUG - User roles array:', userRoles);
  console.log('🚨 DEBUG - User role direct:', user?.role);
  console.log('🚨 DEBUG - User role type:', typeof user?.role);
  console.log('🚨 DEBUG - Is user object truthy:', !!user);
  console.log('🚨 DEBUG - Is userRoles array truthy:', !!userRoles);
  console.log('🚨 DEBUG - UserRoles length:', userRoles?.length);
  
  // Multiple approaches to check edit access
  const hasEditAccess1 = user && (user.role === 'owner' || user.role === 'admin');
  const hasEditAccess2 = userRoles && (userRoles.includes('owner') || userRoles.includes('admin'));
  const hasEditAccess3 = userRoles && userRoles.some(role => 
    role && (role.toLowerCase().includes('owner') || role.toLowerCase().includes('admin'))
  );
  
  // Final combined access check
  const hasEditAccess = hasEditAccess1 || hasEditAccess2 || hasEditAccess3;
  
  console.log('🚨 DEBUG - hasEditAccess1 (user.role):', hasEditAccess1);
  console.log('🚨 DEBUG - hasEditAccess2 (userRoles array):', hasEditAccess2);
  console.log('🚨 DEBUG - hasEditAccess3 (includes check):', hasEditAccess3);
  console.log('🚨 DEBUG - Final hasEditAccess:', hasEditAccess);
  console.log('🚨 DEBUG - showAdminActions prop:', showAdminActions);
  console.log('🚨 DEBUG - Should show buttons:', showAdminActions && hasEditAccess);

  const [isExpanded, setIsExpanded] = useState(false);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [tourMode, setTourMode] = useState('standard'); // 'standard' or 'vip'
  const [tourDuration, setTourDuration] = useState(1); // in hours
  const [priceDetails, setPriceDetails] = useState(null);

  // Parse tour duration from string to hours
  useEffect(() => {
    if (tour?.duration) {
      // Try to extract hours from format like "2 hours" or "90 minutes"
      const hourMatch = tour.duration.match(/(\d+)\s*hour/i);
      const minuteMatch = tour.duration.match(/(\d+)\s*minute/i);
      
      let hours = 1; // Default
      
      if (hourMatch && hourMatch[1]) {
        hours = parseInt(hourMatch[1]);
      } else if (minuteMatch && minuteMatch[1]) {
        hours = parseInt(minuteMatch[1]) / 60;
      }
      
      setTourDuration(hours);
    }
  }, [tour]);

  const handleCardClick = useCallback((e) => {
    // Prevent the click from interfering with navigation
    if (e && e.target.tagName !== 'A' && !e.target.closest('a')) {
      setIsExpanded(prevExpanded => !prevExpanded);
    }
  }, []);

  const handleQuantityChange = useCallback((newQuantity) => {
    if (newQuantity >= 1 && newQuantity <= 20) { // Max 20 quads
      setQuantity(newQuantity);
      if (onQuantityChange) {
        onQuantityChange(newQuantity);
      }
    }
  }, [onQuantityChange]);

  const handleTourModeChange = useCallback((mode) => {
    setTourMode(mode);
  }, []);

  const handleBookingSubmit = useCallback(() => {
    if (onBookingSubmit) {
      // Use price details from our calculator if available
      const totalPrice = priceDetails ? priceDetails.total : (tour.price * quantity);
      
      onBookingSubmit({
        tourId: tour.id,
        tourName: tour.name,
        quantity,
        tourMode,
        duration: tourDuration,
        totalPrice,
        priceDetails,
        selectedDate,
        selectedTime,
        tour
      });
    }
  }, [onBookingSubmit, tour, quantity, tourMode, tourDuration, priceDetails, selectedDate, selectedTime]);

  const handleEditClick = useCallback((e) => {
    e.stopPropagation();
    if (onEditTour) {
      onEditTour(tour);
    }
  }, [onEditTour, tour]);

  const handleDeleteClick = useCallback((e) => {
    e.stopPropagation();
    if (onDeleteTour) {
      onDeleteTour(tour);
    }
  }, [onDeleteTour, tour]);

  const handlePriceChange = useCallback((details) => {
    setPriceDetails(details);
  }, []);

  // Memoize static data to prevent unnecessary recalculations
  const timeSlots = useMemo(() => [
    '08:00', '09:00', '10:00', '11:00', '12:00', 
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ], []);

  const getTourTypeColor = useCallback((type) => {
    switch (type) {
      case 'city':
        return 'bg-green-100 text-green-800';
      case 'mountain':
        return 'bg-purple-100 text-purple-800';
      case 'daily-rental':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const formatTourType = useCallback((type) => {
    if (!type || typeof type !== 'string') {
      return 'Tour';
    }
    
    switch (type) {
      case 'city':
        return 'City Tour';
      case 'mountain':
        return 'Mountain Tour';
      case 'daily-rental':
        return 'Daily Rental';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }, []);
  
  // Memoize calculated values based on tour type
  const tourTypeColor = useMemo(() => getTourTypeColor(tour.type), [getTourTypeColor, tour.type]);
  const formattedTourType = useMemo(() => formatTourType(tour.type), [formatTourType, tour.type]);

  return (
    <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-all duration-300 overflow-hidden">
      {/* Collapsed State - Always Visible */}
      <div 
        className="p-6 cursor-pointer select-none"
        onClick={handleCardClick}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-semibold text-gray-900">{tour.name}</h3>
              {(showAdminActions && hasEditAccess) && (
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={handleEditClick}
                    className="p-2 sm:p-3 sm:min-w-[44px] sm:min-h-[44px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center"
                    title="Edit Tour"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    className="p-2 sm:p-3 sm:min-w-[44px] sm:min-h-[44px] text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                    title="Delete Tour"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${tourTypeColor}`}>
              {formattedTourType}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              ${pricingEnabled ? (tour.price || '?') : tour.price}
            </div>
            <div className="text-sm text-gray-500">per quad</div>
          </div>
        </div>

        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-center">
            <Clock size={16} className="mr-3 text-gray-400" />
            <span>{tour.duration}</span>
          </div>
          
          <div className="flex items-center">
            <MapPin size={16} className="mr-3 text-gray-400" />
            <span>From {tour.location}</span>
          </div>
          
          <div className="flex items-center">
            <Users size={16} className="mr-3 text-gray-400" />
            <span>Up to {tour.maxParticipants} people per quad</span>
          </div>
        </div>

        {/* Expand/Collapse Indicator */}
        <div className="flex justify-center mt-4 pt-4 border-t">
          <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <span className="mr-2">
              {isExpanded ? 'Collapse booking options' : 'Click to book'}
            </span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded State - Booking Options */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="px-6 pb-6 border-t bg-gray-50">
          <div className="pt-6 space-y-6">
            {/* Date and Time Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar size={16} className="inline mr-2" />
                  Tour Date
                </label>
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock size={16} className="inline mr-2" />
                  Start Time
                </label>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  {timeSlots.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tour Mode Selection (if pricing is enabled) */}
            {pricingEnabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tour Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTourModeChange('standard');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border ${
                      tourMode === 'standard' 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTourModeChange('vip');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border ${
                      tourMode === 'vip' 
                        ? 'border-purple-500 bg-purple-50 text-purple-700' 
                        : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    VIP
                  </button>
                </div>
              </div>
            )}

            {/* Quantity Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Number of Quads to Book
              </label>
              <div className="flex items-center space-x-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(quantity - 1);
                  }}
                  disabled={quantity <= 1}
                  className="p-2 sm:p-4 sm:min-w-[44px] sm:min-h-[44px] rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  <Minus size={16} />
                </button>
                
                <div className="flex-1 max-w-20">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => {
                      e.stopPropagation();
                      const newQuantity = parseInt(e.target.value) || 1;
                      handleQuantityChange(newQuantity);
                    }}
                    min="1"
                    max="20"
                    className="w-full px-3 py-2 text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(quantity + 1);
                  }}
                  disabled={quantity >= 20}
                  className="p-2 sm:p-4 sm:min-w-[44px] sm:min-h-[44px] rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Maximum 20 quads per booking
              </p>
            </div>

            {/* Booking Summary */}
            <div className="bg-white p-4 rounded-lg border">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">Date & Time</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedDate.toLocaleDateString()} at {selectedTime}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">Duration</div>
                  <div className="text-sm font-medium text-gray-900">{tour.duration}</div>
                </div>
                
                {/* Dynamic Pricing Calculator */}
                {pricingEnabled ? (
                  <TourPricingCalculator
                    duration={tourDuration}
                    participants={1}
                    isVip={tourMode === 'vip'}
                    numQuads={quantity}
                    selectedDate={selectedDate}
                    className="mt-3"
                    onChange={handlePriceChange}
                  />
                ) : (
                  <div className="flex justify-between items-center border-t pt-2">
                    <div>
                      <div className="text-sm text-gray-600">Total Price</div>
                      <div className="text-xs text-gray-500">{quantity} quad{quantity > 1 ? 's' : ''} × ${tour.price}</div>
                    </div>
                    <div className="text-xl font-bold text-blue-600">
                      ${(tour.price * quantity).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Extras Section (Placeholder for Future) */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Extras & Accessories</h4>
              <div className="text-sm text-gray-500 italic">
                Additional options coming soon...
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="flex-1 px-4 py-2 sm:px-6 sm:py-3 sm:min-h-[44px] text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBookingSubmit();
                }}
                className="flex-1 px-4 py-2 sm:px-6 sm:py-3 sm:min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                Book Now - ${pricingEnabled && priceDetails ? Math.max(1, priceDetails.total).toFixed(2) : (tour.price * quantity).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingCard;