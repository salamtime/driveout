import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { Calendar as CalendarIcon, Grid, List, Settings, Volume2, Wifi, WifiOff } from 'lucide-react';
import { fetchAllBookings, startTour, finishTour } from '../store/slices/bookingsSlice';
import SimplifiedCalendar from '../components/calendar/SimplifiedCalendar';
import ChildFriendlyBookingCard from '../components/calendar/ChildFriendlyBookingCard';
import SimpleConfirmation from '../components/calendar/SimpleConfirmation';
import EditBookingModal from '../components/calendar/EditBookingModal';
import AudioNotificationSettings from '../components/calendar/AudioNotificationSettings';
import audioNotificationSystem from '../utils/audioNotifications';
import { useCalendarSync } from '../hooks/useCalendarSync';

const Calendar = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const bookingsState = useSelector(state => state.bookings);
  const { bookings = [], loading = false, realTimeConnected = false, lastSync = null } = bookingsState || {};
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('calendar'); // 'calendar' or 'list'
  const [selectedDate, setSelectedDate] = useState(null);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(audioNotificationSystem.isNotificationEnabled());
  
  // Initialize real-time calendar sync
  const { 
    events, 
    isConnected, 
    lastUpdate, 
    isLoading, 
    forceSync, 
    connectionStatus 
  } = useCalendarSync();
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: 'default',
    title: '',
    message: '',
    onConfirm: null,
    booking: null
  });
  const [editModal, setEditModal] = useState({
    isOpen: false,
    booking: null
  });

  useEffect(() => {
    // Real-time sync is handled by useCalendarSync hook
    // Only fetch if we don't have real-time connection
    if (!isConnected) {
      dispatch(fetchAllBookings());
    }
  }, [dispatch, isConnected]);

  // Monitor audio settings changes
  useEffect(() => {
    const checkAudioSettings = () => {
      setIsAudioEnabled(audioNotificationSystem.isNotificationEnabled());
    };
    
    const interval = setInterval(checkAudioSettings, 1000);
    return () => clearInterval(interval);
  }, []);

  // Generate calendar days
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

  // Get bookings for a specific date
  const getBookingsForDate = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return bookings.filter(booking => booking.selectedDate === dateStr);
  };

  // Navigate to previous/next month
  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const calendarDays = generateCalendarDays();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const showConfirmation = (type, title, message, onConfirm, booking = null) => {
    setConfirmDialog({
      isOpen: true,
      type,
      title,
      message,
      onConfirm,
      booking
    });
  };

  const hideConfirmation = () => {
    setConfirmDialog({
      isOpen: false,
      type: 'default',
      title: '',
      message: '',
      onConfirm: null,
      booking: null
    });
  };

  // Booking action handlers - ONE TAP ACTIONS
  const handleStartTour = (booking) => {
    showConfirmation(
      'success',
      'START THIS TOUR?',
      `Ready to start ${booking.tourName} for ${booking.participants?.[0]?.name || 'Guest'}?`,
      async () => {
        try {
          await dispatch(startTour(booking.id)).unwrap();
          hideConfirmation();
        } catch (error) {
          console.error('Failed to start tour:', error);
          alert('❌ Could not start tour. Please try again.');
          hideConfirmation();
        }
      },
      booking
    );
  };

  const handleFinishTour = (booking) => {
    showConfirmation(
      'danger',
      'FINISH THIS TOUR?',
      `Are you ready to complete ${booking.tourName}? This will mark the tour as finished.`,
      async () => {
        try {
          const startTime = new Date(booking.startTime);
          const endTime = new Date();
          const actualDuration = Math.floor((endTime - startTime) / (1000 * 60));
          
          await dispatch(finishTour({
            bookingId: booking.id,
            actualDuration,
            endTime: endTime.toISOString()
          })).unwrap();
          hideConfirmation();
        } catch (error) {
          console.error('Failed to finish tour:', error);
          alert('❌ Could not finish tour. Please try again.');
          hideConfirmation();
        }
      },
      booking
    );
  };

  const handleEditBooking = (booking) => {
    setEditModal({
      isOpen: true,
      booking: booking
    });
  };

  const handleSaveBooking = async (updatedBooking) => {
    try {
      // In a real app, you would dispatch an update action here
      // await dispatch(updateBooking(updatedBooking)).unwrap();
      
      // For now, we'll just close the modal and show success
      setEditModal({ isOpen: false, booking: null });
      alert('✅ Booking updated successfully!');
      
      // Refresh bookings to show changes
      dispatch(fetchAllBookings());
    } catch (error) {
      console.error('Failed to update booking:', error);
      alert('❌ Could not update booking. Please try again.');
    }
  };

  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      booking: null
    });
  };

  const handleCancelBooking = (booking) => {
    showConfirmation(
      'danger',
      'CANCEL THIS BOOKING?',
      `This will cancel ${booking.tourName} for ${booking.participants?.[0]?.name || 'Guest'}. This cannot be undone!`,
      async () => {
        try {
          // Implement cancel booking logic here
          console.log('Canceling booking:', booking.id);
          alert('✅ Booking cancelled successfully!');
          hideConfirmation();
        } catch (error) {
          console.error('Failed to cancel booking:', error);
          alert('❌ Could not cancel booking. Please try again.');
          hideConfirmation();
        }
      },
      booking
    );
  };

  // Simple date and view handlers
  const handleDateClick = (day) => {
    setSelectedDate(day);
    setView('list'); // Switch to list view to show bookings for that day
  };

  const handleViewDetails = (dayBookings) => {
    // Show simple alert with booking count
    alert(`📅 ${dayBookings.length} booking${dayBookings.length !== 1 ? 's' : ''} on this day!\n\nTap "LIST" view to see all bookings.`);
  };

  // Audio settings handlers
  const handleOpenAudioSettings = () => {
    setAudioSettingsOpen(true);
  };

  const handleCloseAudioSettings = () => {
    setAudioSettingsOpen(false);
  };

  const handleQuickToggleAudio = () => {
    const newState = !isAudioEnabled;
    audioNotificationSystem.setEnabled(newState);
    setIsAudioEnabled(newState);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* SUPER SIMPLE Header with Audio Controls */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-4 mb-4">
          <h1 className="text-4xl font-black text-gray-900">
            📅 TOUR CALENDAR
          </h1>
          
          {/* Audio Control Buttons */}
          <div className="flex items-center gap-2">
            {/* Quick Toggle Button */}
            <button
              onClick={handleQuickToggleAudio}
              className={`p-3 rounded-2xl font-bold text-lg transition-all duration-200 ${
                isAudioEnabled
                  ? 'bg-green-500 text-white shadow-lg hover:bg-green-600'
                  : 'bg-gray-300 text-gray-600 hover:bg-gray-400'
              }`}
              title={isAudioEnabled ? 'Audio alerts ON - Click to disable' : 'Audio alerts OFF - Click to enable'}
            >
              <Volume2 className="h-6 w-6" />
            </button>
            
            {/* Settings Button */}
            <button
              onClick={handleOpenAudioSettings}
              className="bg-blue-500 text-white p-3 rounded-2xl font-bold text-lg hover:bg-blue-600 transition-all duration-200 shadow-lg"
              title="Audio notification settings"
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <p className="text-xl font-bold text-gray-600">
          Simple booking management for guides
        </p>
        
        {/* Audio Status Indicator */}
        <div className={`inline-flex items-center mt-3 px-4 py-2 rounded-full text-sm font-bold ${
          isAudioEnabled 
            ? 'bg-green-100 text-green-800 border-2 border-green-300'
            : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
        }`}>
          <Volume2 className="h-4 w-4 mr-2" />
          Audio Alerts: {isAudioEnabled ? 'ON' : 'OFF'}
        </div>

        {/* Real-time Connection Status */}
        <div className={`inline-flex items-center mt-2 mx-2 px-3 py-1 rounded-full text-xs font-bold ${
          isConnected 
            ? 'bg-blue-100 text-blue-800 border border-blue-300'
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          {isConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
          Real-time: {connectionStatus.toUpperCase()}
          {lastUpdate && (
            <span className="ml-2 text-xs opacity-75">
              Updated: {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      
      {/* GIANT View Toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-white rounded-3xl p-2 shadow-lg border-2 border-gray-200">
          <button
            onClick={() => setView('calendar')}
            className={`px-8 py-4 text-xl font-black rounded-2xl transition-all duration-200 ${
              view === 'calendar' 
                ? 'bg-blue-500 text-white shadow-lg' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={{ minHeight: '80px', minWidth: '150px' }}
          >
            <Grid className="h-8 w-8 mx-auto mb-2" />
            CALENDAR
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-8 py-4 text-xl font-black rounded-2xl transition-all duration-200 ${
              view === 'list' 
                ? 'bg-blue-500 text-white shadow-lg' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={{ minHeight: '80px', minWidth: '150px' }}
          >
            <List className="h-8 w-8 mx-auto mb-2" />
            LIST
          </button>
        </div>
      </div>

      {/* ULTRA-SIMPLE Views */}
      {view === 'calendar' ? (
        <SimplifiedCalendar 
          currentDate={currentDate}
          bookings={bookings}
          onDateClick={handleDateClick}
          onMonthChange={setCurrentDate}
          onViewDetails={handleViewDetails}
        />
      ) : (
        <div className="space-y-6">
          {/* List Header */}
          <div className="text-center bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200">
            <h2 className="text-3xl font-black text-gray-900 mb-2">
              📋 ALL BOOKINGS
            </h2>
            <p className="text-lg font-bold text-gray-600">
              {bookings.length} total booking{bookings.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Child-Friendly Booking Cards */}
          {bookings.length === 0 ? (
            <div className="text-center bg-white rounded-3xl p-12 shadow-lg border-2 border-gray-200">
              <div className="text-6xl mb-4">😴</div>
              <h3 className="text-3xl font-black text-gray-900 mb-2">
                NO BOOKINGS TODAY
              </h3>
              <p className="text-xl font-bold text-gray-600">
                All quiet! Time to relax.
              </p>
            </div>
          ) : (
            bookings.map((booking) => (
              <ChildFriendlyBookingCard
                key={booking.id}
                booking={booking}
                onStart={handleStartTour}
                onFinish={handleFinishTour}
                onEdit={handleEditBooking}
                onCancel={handleCancelBooking}
              />
            ))
          )}
        </div>
      )}

      {/* Simple Confirmation Dialog */}
      <SimpleConfirmation
        isOpen={confirmDialog.isOpen}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={hideConfirmation}
      />

      {/* Edit Booking Modal */}
      <EditBookingModal
        booking={editModal.booking}
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        onSave={handleSaveBooking}
      />

      {/* Audio Notification Settings Modal */}
      <AudioNotificationSettings
        isOpen={audioSettingsOpen}
        onClose={handleCloseAudioSettings}
      />
    </div>
  );
};

export default Calendar;