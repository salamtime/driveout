import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import ClickableCalendarEvent from './ClickableCalendarEvent';
import BookingDetailsModal from './BookingDetailsModal';

const SimplifiedCalendar = ({ 
  currentDate, 
  bookings, 
  onDateClick, 
  onMonthChange,
  onViewDetails,
  onStartTour,
  onFinishTour,
  onEditBooking
}) => {
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getBookingsForDate = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return bookings.filter(booking => booking.selectedDate === dateStr);
  };

  // Transform bookings into calendar events
  const transformBookingToEvent = (booking) => ({
    id: booking.id,
    title: booking.tourName || 'Unknown Tour',
    start: new Date(booking.selectedDate + 'T' + booking.selectedTime),
    status: booking.status,
    guide: booking.assignedGuide || booking.guideName,
    participants: booking.participants || [],
    resource: {
      type: 'booking',
      data: booking
    }
  });

  // Handle event click
  const handleEventClick = (event) => {
    const booking = event.resource.data;
    setSelectedBooking(booking);
    setIsModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setSelectedBooking(null);
    setIsModalOpen(false);
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    onMonthChange(newDate);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const calendarDays = generateCalendarDays();

  return (
    <div className="bg-white rounded-3xl shadow-lg border-2 border-gray-200">
      {/* Super Simple Header */}
      <div className="p-6 border-b-2 border-gray-200">
        <div className="flex items-center justify-center space-x-6">
          <button
            onClick={() => navigateMonth('prev')}
            className="bg-blue-100 hover:bg-blue-200 active:bg-blue-300 p-4 rounded-2xl transition-all duration-200 shadow-md"
            style={{ minWidth: '80px', minHeight: '80px' }}
          >
            <ChevronLeft className="h-8 w-8 text-blue-600 mx-auto" />
          </button>
          
          <h2 className="text-3xl font-bold text-gray-900 text-center min-w-[200px]">
            {monthNames[currentDate.getMonth()]}<br />
            <span className="text-2xl text-blue-600">{currentDate.getFullYear()}</span>
          </h2>
          
          <button
            onClick={() => navigateMonth('next')}
            className="bg-blue-100 hover:bg-blue-200 active:bg-blue-300 p-4 rounded-2xl transition-all duration-200 shadow-md"
            style={{ minWidth: '80px', minHeight: '80px' }}
          >
            <ChevronRight className="h-8 w-8 text-blue-600 mx-auto" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {/* Day Headers - Super Simple */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="text-center py-3">
              <span className="text-lg font-bold text-gray-700">{day}</span>
            </div>
          ))}
        </div>
        
        {/* Massive Day Blocks */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((day, index) => {
            const dayBookings = day ? getBookingsForDate(day) : [];
            const hasBookings = dayBookings.length > 0;
            const isToday = day && 
              new Date().getDate() === day && 
              new Date().getMonth() === currentDate.getMonth() && 
              new Date().getFullYear() === currentDate.getFullYear();
            
            if (!day) {
              return <div key={index} className="h-24 md:h-32"></div>;
            }
            
            return (
              <div
                key={index}
                className={`
                  relative h-24 md:h-32 rounded-2xl border-2 cursor-pointer transition-all duration-200
                  ${isToday 
                    ? 'bg-blue-500 border-blue-600 text-white shadow-lg' 
                    : hasBookings 
                      ? 'bg-green-100 border-green-300 hover:bg-green-200 active:bg-green-300 shadow-md' 
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                  }
                `}
                onClick={() => onDateClick && onDateClick(day)}
              >
                {/* Day Number - HUGE */}
                <div className={`text-2xl font-bold text-center pt-2 ${
                  isToday ? 'text-white' : hasBookings ? 'text-green-800' : 'text-gray-900'
                }`}>
                  {day}
                </div>
                
                {/* Booking Indicator - GIANT */}
                {hasBookings && (
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                    <div className={`w-4 h-4 rounded-full ${
                      isToday ? 'bg-white' : 'bg-green-500'
                    }`}></div>
                    <div className={`text-xs font-bold text-center mt-1 ${
                      isToday ? 'text-white' : 'text-green-800'
                    }`}>
                      {dayBookings.length}
                    </div>
                  </div>
                )}

                {/* Clickable Event Preview */}
                {hasBookings && dayBookings.length > 0 && (
                  <div 
                    className="absolute inset-2 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const event = transformBookingToEvent(dayBookings[0]);
                      handleEventClick(event);
                    }}
                  >
                    <div className="bg-white bg-opacity-95 rounded-lg p-1 text-xs font-bold text-center shadow-lg">
                      Click for details
                    </div>
                  </div>
                )}

                {/* View Details Button for Mobile */}
                {hasBookings && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const event = transformBookingToEvent(dayBookings[0]);
                      handleEventClick(event);
                    }}
                    className="md:hidden absolute top-1 right-1 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-lg p-1"
                  >
                    <Eye className="h-3 w-3 text-gray-600" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Simple Legend */}
      <div className="border-t-2 border-gray-200 p-4">
        <div className="flex justify-center space-x-6">
          <div className="flex items-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full mr-2"></div>
            <span className="text-lg font-semibold text-gray-700">Today</span>
          </div>
          <div className="flex items-center">
            <div className="w-6 h-6 bg-green-100 border-2 border-green-300 rounded-full mr-2"></div>
            <span className="text-lg font-semibold text-gray-700">Has Bookings</span>
          </div>
          <div className="flex items-center">
            <div className="w-6 h-6 bg-gray-50 border-2 border-gray-200 rounded-full mr-2"></div>
            <span className="text-lg font-semibold text-gray-700">Available</span>
          </div>
        </div>
      </div>

      {/* Booking Details Modal */}
      <BookingDetailsModal
        booking={selectedBooking}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onStart={onStartTour}
        onFinish={onFinishTour}
        onEdit={onEditBooking}
      />
    </div>
  );
};

export default SimplifiedCalendar;