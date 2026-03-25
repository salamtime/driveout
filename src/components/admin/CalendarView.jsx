import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Calendar, Clock, User, Car } from 'lucide-react';
import { getVehicleField } from '../../config/tables';

const CalendarView = ({ rentals = [] }) => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'

  // Get calendar data based on current date and view mode
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Get first day of the month and last day
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get first day of the calendar (might be from previous month)
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // Get last day of the calendar (might be from next month)
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    // Generate calendar days
    const days = [];
    const currentDay = new Date(startDate);
    
    while (currentDay <= endDate) {
      days.push(new Date(currentDay));
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return {
      days,
      firstDay,
      lastDay,
      year,
      month
    };
  }, [currentDate]);

  // Filter rentals for the current calendar view
  const filteredRentals = useMemo(() => {
    return rentals.filter(rental => {
      if (!rental.rental_start_date) return false;
      
      const rentalStart = new Date(rental.rental_start_date);
      const rentalEnd = new Date(rental.rental_end_date || rental.rental_start_date);
      
      // Check if rental overlaps with any day in the calendar
      return calendarData.days.some(day => {
        const dayStart = new Date(day);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);
        
        return (rentalStart <= dayEnd && rentalEnd >= dayStart);
      });
    });
  }, [rentals, calendarData.days]);

  // Get rentals for a specific day
  const getRentalsForDay = (day) => {
    return filteredRentals.filter(rental => {
      if (!rental.rental_start_date) return false;
      
      const rentalStart = new Date(rental.rental_start_date);
      const rentalEnd = new Date(rental.rental_end_date || rental.rental_start_date);
      
      const dayStart = new Date(day);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      
      return (rentalStart <= dayEnd && rentalEnd >= dayStart);
    });
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'scheduled':
        return 'bg-blue-500';
      case 'rented':
        return 'bg-green-500';
      case 'completed':
        return 'bg-gray-500';
      case 'cancelled':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {formatDate(currentDate)}
          </h2>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={goToToday}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Today
          </button>
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-2 text-sm font-medium border-t border-b ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-2 text-sm font-medium rounded-r-md border ${
                viewMode === 'day'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="bg-gray-50 py-2 px-3">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">
                {day}
              </div>
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {calendarData.days.map((day, dayIdx) => {
            const dayRentals = getRentalsForDay(day);
            const isCurrentMonthDay = isCurrentMonth(day);
            const isTodayDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={`bg-white min-h-[120px] p-2 ${
                  !isCurrentMonthDay ? 'bg-gray-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-sm font-medium ${
                      isTodayDay
                        ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
                        : isCurrentMonthDay
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayRentals.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {dayRentals.length}
                    </span>
                  )}
                </div>

                {/* Rental events for this day */}
                <div className="space-y-1">
                  {dayRentals.slice(0, 3).map((rental, idx) => (
                    <div
                      key={`${rental.id}-${idx}`}
                      className={`text-xs p-1 rounded text-white truncate ${getStatusColor(
                        rental.rental_status
                      )}`}
                      title={`${rental.customer_name || 'Unknown'} - ${
                        rental.vehicle?.name || 'Unknown Vehicle'
                      }`}
                    >
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {rental.customer_name || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {dayRentals.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayRentals.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Status Legend</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { status: 'scheduled', label: 'Scheduled' },
            { status: 'rented', label: 'Rented' },
            { status: 'completed', label: 'Completed' },
            { status: 'cancelled', label: 'Cancelled' },
            { status: 'pending', label: 'Pending' }
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded ${getStatusColor(status)}`}></div>
              <span className="text-sm text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-blue-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Rentals</p>
              <p className="text-lg font-semibold text-gray-900">{filteredRentals.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Clock className="h-5 w-5 text-green-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-gray-600">Active Rentals</p>
              <p className="text-lg font-semibold text-gray-900">
                {filteredRentals.filter(r => r.rental_status === 'rented').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Car className="h-5 w-5 text-purple-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-gray-600">Scheduled</p>
              <p className="text-lg font-semibold text-gray-900">
                {filteredRentals.filter(r => r.rental_status === 'scheduled').length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;