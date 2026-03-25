import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, User, Car } from 'lucide-react';
import { getVehicleField } from '../../config/tables';

const RentalCalendar = ({ rentals = [], vehicles = [], onEdit, onAddNew }) => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedRental, setSelectedRental] = useState(null);

  // Generate calendar data
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    const days = [];
    const currentDay = new Date(startDate);
    
    while (currentDay <= endDate) {
      days.push(new Date(currentDay));
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return { days, firstDay, lastDay, year, month };
  }, [currentDate]);

  // Get rentals for a specific day
  const getRentalsForDay = (day) => {
    return rentals.filter(rental => {
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

  const formatMonthYear = (date) => {
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
        return 'bg-blue-500 text-white';
      case 'rented':
        return 'bg-green-500 text-white';
      case 'completed':
        return 'bg-gray-500 text-white';
      case 'cancelled':
        return 'bg-red-500 text-white';
      case 'pending':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {formatMonthYear(currentDate)}
          </h2>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t('admin.rentals.today', 'Today')}
          </button>
          <button
            onClick={onAddNew}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('admin.rentals.addRental', 'Add Rental')}
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="bg-gray-50 py-3 px-3">
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
                className={`bg-white min-h-[140px] p-2 ${
                  !isCurrentMonthDay ? 'bg-gray-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-medium ${
                      isTodayDay
                        ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center'
                        : isCurrentMonthDay
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayRentals.length > 0 && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {dayRentals.length}
                    </span>
                  )}
                </div>

                {/* Rental events for this day */}
                <div className="space-y-1">
                  {dayRentals.slice(0, 3).map((rental, idx) => {
                    const vehicle = vehicles.find(v => v.id === rental.vehicle_id);
                    
                    return (
                      <div
                        key={`${rental.id}-${idx}`}
                        className={`text-xs p-2 rounded cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(
                          rental.rental_status
                        )}`}
                        onClick={() => setSelectedRental(rental)}
                        title={`${rental.customer_name || 'Unknown'} - ${
                          vehicle?.name || 'Unknown Vehicle'
                        }`}
                      >
                        <div className="flex items-center space-x-1 mb-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate font-medium">
                            {rental.customer_name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Car className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {getVehicleField(vehicle, 'plate')}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 mt-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span className="text-xs">
                            {formatTime(rental.rental_start_date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {dayRentals.length > 3 && (
                    <div className="text-xs text-gray-500 text-center py-1">
                      +{dayRentals.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          {t('admin.rentals.statusLegend', 'Status Legend')}
        </h3>
        <div className="flex flex-wrap gap-4">
          {[
            { status: 'scheduled', label: t('admin.rentals.scheduled', 'Scheduled') },
            { status: 'rented', label: t('admin.rentals.rented', 'Rented') },
            { status: 'completed', label: t('admin.rentals.completed', 'Completed') },
            { status: 'cancelled', label: t('admin.rentals.cancelled', 'Cancelled') },
            { status: 'pending', label: t('admin.rentals.pending', 'Pending') }
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center space-x-2">
              <div className={`w-4 h-4 rounded ${getStatusColor(status)}`}></div>
              <span className="text-sm text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rental Details Modal */}
      {selectedRental && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
              onClick={() => setSelectedRental(null)}
            ></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {t('admin.rentals.rentalDetails', 'Rental Details')}
                  </h3>
                  <button
                    onClick={() => setSelectedRental(null)}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Customer:</span>
                    <p className="text-sm text-gray-900">{selectedRental.customer_name}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Vehicle:</span>
                    <p className="text-sm text-gray-900">
                      {vehicles.find(v => v.id === selectedRental.vehicle_id)?.name || 'Unknown Vehicle'}
                    </p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Duration:</span>
                    <p className="text-sm text-gray-900">
                      {new Date(selectedRental.rental_start_date).toLocaleString()} - {' '}
                      {new Date(selectedRental.rental_end_date).toLocaleString()}
                    </p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Status:</span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ml-2 ${getStatusColor(selectedRental.rental_status)}`}>
                      {selectedRental.rental_status}
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-500">Total Amount:</span>
                    <p className="text-sm text-gray-900">${selectedRental.total_amount}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(selectedRental);
                    setSelectedRental(null);
                  }}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {t('common.edit', 'Edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRental(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {t('common.close', 'Close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalCalendar;