import React, { useState } from 'react';
import { Clock, User, MapPin, Info } from 'lucide-react';

const ClickableCalendarEvent = ({ event, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-orange-100 border-orange-300 text-orange-800',
      confirmed: 'bg-green-100 border-green-300 text-green-800',
      on_tour: 'bg-blue-100 border-blue-300 text-blue-800',
      completed: 'bg-gray-100 border-gray-300 text-gray-800',
      cancelled: 'bg-red-100 border-red-300 text-red-800'
    };
    return colors[status] || 'bg-gray-100 border-gray-300 text-gray-800';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'confirmed': return '✅';
      case 'on_tour': return '🚀';
      case 'completed': return '✨';
      case 'cancelled': return '❌';
      default: return '📋';
    }
  };

  return (
    <div
      className={`
        cursor-pointer p-3 rounded-lg border-2 transition-all duration-200 
        ${getStatusColor(event.status)}
        ${isHovered ? 'shadow-lg scale-105' : 'shadow-sm'}
      `}
      onClick={() => onClick(event)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getStatusIcon(event.status)}</span>
          <span className="font-bold text-sm truncate">{event.title}</span>
        </div>
        <Info className="h-4 w-4 opacity-60" />
      </div>
      
      <div className="mt-2 space-y-1">
        <div className="flex items-center space-x-2 text-xs">
          <Clock className="h-3 w-3" />
          <span>{event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        
        {event.guide && (
          <div className="flex items-center space-x-2 text-xs">
            <User className="h-3 w-3" />
            <span className="truncate">{event.guide}</span>
          </div>
        )}
        
        {event.participants && event.participants.length > 0 && (
          <div className="flex items-center space-x-2 text-xs">
            <MapPin className="h-3 w-3" />
            <span>{event.participants.length} participant{event.participants.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      
      <div className="mt-2 text-xs font-semibold uppercase">
        Status: {event.status.replace('_', ' ')}
      </div>
    </div>
  );
};

export default ClickableCalendarEvent;