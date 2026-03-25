import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Grid, List } from 'lucide-react';

const ResponsiveCalendarGrid = ({ 
  currentDate, 
  bookings, 
  onDateClick, 
  onMonthChange,
  onBookingClick 
}) => {
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            
            <h2 className="text-xl font-semibold text-gray-900">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* View Mode Toggle - Mobile Only */}
          <div className="md:hidden flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('month')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'month' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600'
              }`}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'week' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600'
              }`}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Calendar className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-2 md:p-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-700">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
        </div>
        
        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            const dayBookings = day ? getBookingsForDate(day) : [];
            const isToday = day && 
              new Date().getDate() === day && 
              new Date().getMonth() === currentDate.getMonth() && 
              new Date().getFullYear() === currentDate.getFullYear();
            
            return (
              <div
                key={index}
                className={`
                  ${day ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''} 
                  p-2 min-h-[60px] md:min-h-[100px] border border-gray-100 rounded-lg transition-colors touch-manipulation
                `}
                onClick={() => day && onDateClick && onDateClick(day)}
                style={{ minWidth: '44px' }}
              >
                {day && (
                  <>
                    <div className={`text-sm md:text-base font-medium mb-1 ${
                      isToday ? 'text-blue-600 font-bold' : 'text-gray-900'
                    }`}>
                      {day}
                    </div>
                    
                    {/* Mobile: Show booking count */}
                    <div className="md:hidden">
                      {dayBookings.length > 0 && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mx-auto"></div>
                      )}
                    </div>

                    {/* Desktop: Show booking details */}
                    <div className="hidden md:block">
                      {dayBookings.slice(0, 2).map((booking, i) => (
                        <div
                          key={booking.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBookingClick && onBookingClick(booking);
                          }}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-1 truncate cursor-pointer hover:bg-blue-200 transition-colors"
                        >
                          {booking.selectedTime} - {booking.participants?.[0]?.name || 'Guest'}
                        </div>
                      ))}
                      
                      {dayBookings.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{dayBookings.length - 2} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Booking Summary */}
      <div className="md:hidden border-t border-gray-200 p-4">
        <div className="text-sm text-gray-600">
          Total bookings this month: {bookings.filter(b => b.selectedDate?.startsWith(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`)).length}
        </div>
      </div>
    </div>
  );
};

export default ResponsiveCalendarGrid;