import React, { useState } from 'react';
import { Calendar, Clock, Users, MapPin, ChevronDown, ChevronUp, Play, Square, Edit, X } from 'lucide-react';
import MobileActionButtons from './MobileActionButtons';

const MobileBookingCard = ({ booking, onStart, onFinish, onEdit, onCancel }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'on_tour':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'on_tour':
        return 'On Tour';
      case 'confirmed':
        return 'Confirmed';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
      {/* Main Card Content */}
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">
                {booking.participants?.[0]?.name || 'Guest Booking'}
              </h3>
              <p className="text-sm text-gray-500 font-mono">
                ID: {booking.id?.substring(0, 8)}...
              </p>
            </div>
          </div>
          
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(booking.status)}`}>
            {getStatusText(booking.status)}
          </div>
        </div>

        {/* Tour Info */}
        <div className="space-y-2 mb-4">
          <div className="bg-gray-50 p-2 rounded-lg mb-1">
            <h4 className="text-sm font-medium text-gray-800 mb-1">Tour Details</h4>
            <div className="flex items-center text-gray-700">
              <MapPin className="h-4 w-4 mr-2 text-blue-600" />
              <span className="font-medium">{booking.tourName || "Unknown Tour"}</span>
            </div>
            {booking.tourLocation && (
              <div className="flex items-center text-gray-700 mt-1 ml-6">
                <span className="text-sm">Location: {booking.tourLocation}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center text-gray-600">
            <Clock className="h-4 w-4 mr-2 text-blue-600" />
            <span>{formatDate(booking.selectedDate)} at {booking.selectedTime}</span>
          </div>
          
          <div className="flex items-center text-gray-600">
            <Users className="h-4 w-4 mr-2 text-blue-600" />
            <span>{booking.participants?.length || 0} participants</span>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Participants</h4>
              <div className="space-y-1">
                {booking.participants?.map((participant, index) => (
                  <div key={index} className="text-sm text-gray-600">
                    {participant.name} ({participant.age} years)
                  </div>
                ))}
              </div>
            </div>
            
            {booking.quadSelection?.selectedQuads && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Assigned Vehicles</h4>
                <div className="space-y-1">
                  {booking.quadSelection.selectedQuads.map((quad, index) => (
                    <div key={index} className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                      {quad.quadName} - {quad.participantCount} riders
                    </div>
                  ))}
                </div>
              </div>
            )}

            {booking.status === 'on_tour' && booking.startTime && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-medium text-blue-900 mb-1">Tour in Progress</h4>
                <p className="text-sm text-blue-700">
                  Started: {new Date(booking.startTime).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center py-2 text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span className="text-sm font-medium mr-1">
            {isExpanded ? 'Less Details' : 'More Details'}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="border-t border-gray-100 p-4">
        <MobileActionButtons
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

export default MobileBookingCard;