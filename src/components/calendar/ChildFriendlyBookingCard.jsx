import React, { useState } from 'react';
import { Calendar, Clock, Users, MapPin, Play, Square, Edit, X, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import GiantActionButtons from './GiantActionButtons';
import LiveTourTimer from './LiveTourTimer';
import { isTimerActive, getTimerStartTime } from '../../utils/timerUtils';

const ChildFriendlyBookingCard = ({ booking, onStart, onFinish, onEdit, onCancel }) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Show timer if booking status is 'on_tour' OR if localStorage has timer data
  const shouldShowTimer = booking.status === 'on_tour' || isTimerActive(booking.id);
  const timerStartTime = getTimerStartTime(booking.id) || booking.startTime;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500 text-white';
      case 'on_tour':
        return 'bg-blue-500 text-white';
      case 'completed':
        return 'bg-gray-500 text-white';
      case 'cancelled':
        return 'bg-red-500 text-white';
      default:
        return 'bg-yellow-500 text-white';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'on_tour':
        return '🚀 ON TOUR';
      case 'confirmed':
        return '✅ CONFIRMED';
      case 'completed':
        return '🏁 COMPLETED';
      case 'cancelled':
        return '❌ CANCELLED';
      default:
        return status?.toUpperCase();
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg border-2 border-gray-200 mb-6 overflow-hidden">
      {/* Live Timer Display - Show when tour is active */}
      {shouldShowTimer && (
        <LiveTourTimer 
          booking={booking}
          isActive={shouldShowTimer}
          startTime={timerStartTime}
          onTimerUpdate={(seconds) => {
            // Update can be handled here if needed
          }}
        />
      )}

      {/* Header - GIANT Status Badge */}
      <div className={`p-6 text-center relative ${getStatusColor(booking.status)}`}>
        {shouldShowTimer && (
          <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
            <Play className="h-4 w-4 inline mr-1" />
            LIVE
          </div>
        )}
        <div className="text-2xl font-black">
          {shouldShowTimer ? '🚀 ON TOUR' : getStatusText(booking.status)}
        </div>
        {shouldShowTimer && (
          <div className="text-lg font-bold text-white opacity-90 mt-1">
            Timer Running • {booking.tourName}
          </div>
        )}
      </div>

      {/* Main Content - HUGE Text */}
      <div className="p-6 space-y-6">
        {/* Customer Name - MASSIVE */}
        <div className="text-center">
          <h2 className="text-3xl font-black text-gray-900 mb-2">
            {booking.participants?.[0]?.name || 'GUEST BOOKING'}
          </h2>
          <div className="text-lg font-bold text-gray-500 bg-gray-100 px-4 py-2 rounded-2xl inline-block">
            ID: {booking.id?.substring(0, 8)}...
          </div>
        </div>

        {/* Essential Info - BIG Icons and Text */}
        <div className="space-y-4">
          <div className="flex items-center bg-blue-50 p-4 rounded-2xl">
            <div className="bg-blue-500 p-3 rounded-2xl mr-4">
              <MapPin className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-blue-600 uppercase">Tour Type</div>
              <div className="text-2xl font-bold text-blue-900">
                {booking.tourName}
              </div>
            </div>
          </div>
          
          <div className="flex items-center bg-green-50 p-4 rounded-2xl">
            <div className="bg-green-500 p-3 rounded-2xl mr-4">
              <Calendar className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-green-600 uppercase">Date & Time</div>
              <div className="text-xl font-bold text-green-900">
                {formatDate(booking.selectedDate)}
              </div>
              <div className="text-lg font-semibold text-green-700">
                at {booking.selectedTime}
              </div>
            </div>
          </div>
          
          <div className="flex items-center bg-purple-50 p-4 rounded-2xl">
            <div className="bg-purple-500 p-3 rounded-2xl mr-4">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-purple-600 uppercase">Participants</div>
              <div className="text-2xl font-bold text-purple-900">
                {booking.participants?.length || 0} People
              </div>
            </div>
          </div>
        </div>

        {/* Show More Details Button */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 py-4 px-6 rounded-2xl transition-all duration-200"
          style={{ minHeight: '60px' }}
        >
          <div className="flex items-center justify-center">
            <span className="text-lg font-bold text-gray-700 mr-2">
              {showDetails ? 'HIDE DETAILS' : 'SHOW MORE DETAILS'}
            </span>
            {showDetails ? (
              <ChevronUp className="h-6 w-6 text-gray-700" />
            ) : (
              <ChevronDown className="h-6 w-6 text-gray-700" />
            )}
          </div>
        </button>

        {/* Extra Details - Only if expanded */}
        {showDetails && (
          <div className="space-y-4 border-t-2 border-gray-200 pt-6">
            {booking.participants?.map((participant, index) => (
              <div key={index} className="bg-yellow-50 p-4 rounded-2xl">
                <div className="text-lg font-bold text-yellow-900">
                  👤 {participant.name} ({participant.age} years old)
                </div>
              </div>
            ))}
            
            {booking.quadSelection?.selectedQuads?.map((quad, index) => (
              <div key={index} className="bg-orange-50 p-4 rounded-2xl">
                <div className="text-lg font-bold text-orange-900">
                  🏍️ {quad.quadName} - {quad.participantCount} riders
                </div>
              </div>
            ))}

            {booking.status === 'on_tour' && booking.startTime && (
              <div className="bg-blue-50 border-2 border-blue-300 p-4 rounded-2xl">
                <div className="text-lg font-bold text-blue-900">
                  🕒 Started: {new Date(booking.startTime).toLocaleTimeString()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GIANT Action Buttons */}
      <div className="border-t-2 border-gray-200 p-6">
        <GiantActionButtons
          booking={booking}
          onStart={onStart}
          onFinish={onFinish}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
};

export default ChildFriendlyBookingCard;