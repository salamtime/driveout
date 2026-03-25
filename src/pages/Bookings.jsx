import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Calendar, List, Clock, Users, MapPin, Car, Play, Square, Trash2, Eye, Edit } from 'lucide-react';
import { startTour, finishTour, fetchAllBookings } from '../store/slices/bookingsSlice';
import { updateVehicleStatus } from '../store/slices/vehiclesSlice';
import BookingDeleteModal from '../components/admin/BookingDeleteModal';
import BookingDetailsModal from '../components/admin/BookingDetailsModal';
import DebugAuthState from '../components/DebugAuthState';
import toast from 'react-hot-toast';

const Bookings = () => {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector(state => state.bookings || { bookings: [], loading: false });
  const authState = useSelector(state => state.auth);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filter, setFilter] = useState('all'); // 'all', 'upcoming', 'past', 'active'
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  useEffect(() => {
    dispatch(fetchAllBookings());
  }, [dispatch]);

  // Comprehensive permission checking function with extensive logging
  const checkUserPermissions = () => {
    console.log('🔍 BOOKINGS PAGE - Permission Check Started');
    console.log('🔍 Full Auth State:', authState);
    console.log('🔍 User Object:', authState?.user);
    console.log('🔍 UserRoles Array:', authState?.userRoles);
    
    const user = authState?.user;
    const userRoles = authState?.userRoles;
    
    // Check multiple role sources
    const roleChecks = {
      userRolesArray: userRoles && Array.isArray(userRoles) ? userRoles : [],
      userRoleDirect: user?.role || null,
      userMetadataRole: user?.user_metadata?.role || null,
      appMetadataRole: user?.app_metadata?.role || null,
      emailPattern: user?.email || null
    };
    
    console.log('🔍 Role Checks:', roleChecks);
    
    // Check if user is admin or owner
    const isOwner = 
      roleChecks.userRolesArray.includes('owner') ||
      roleChecks.userRoleDirect === 'owner' ||
      roleChecks.userMetadataRole === 'owner' ||
      roleChecks.appMetadataRole === 'owner' ||
      (roleChecks.emailPattern && roleChecks.emailPattern.includes('owner'));
    
    const isAdmin = 
      roleChecks.userRolesArray.includes('admin') ||
      roleChecks.userRoleDirect === 'admin' ||
      roleChecks.userMetadataRole === 'admin' ||
      roleChecks.appMetadataRole === 'admin' ||
      (roleChecks.emailPattern && roleChecks.emailPattern.includes('admin'));
    
    const isEmployee = 
      roleChecks.userRolesArray.includes('employee') ||
      roleChecks.userRoleDirect === 'employee' ||
      roleChecks.userMetadataRole === 'employee' ||
      roleChecks.appMetadataRole === 'employee' ||
      (roleChecks.emailPattern && roleChecks.emailPattern.includes('employee'));
    
    const isGuide = 
      roleChecks.userRolesArray.includes('guide') ||
      roleChecks.userRoleDirect === 'guide' ||
      roleChecks.userMetadataRole === 'guide' ||
      roleChecks.appMetadataRole === 'guide' ||
      (roleChecks.emailPattern && roleChecks.emailPattern.includes('guide'));
    
    const hasBookingAccess = isOwner || isAdmin || isEmployee || isGuide;
    const hasAdminAccess = isOwner || isAdmin;
    
    console.log('🔍 Permission Results:', {
      isOwner,
      isAdmin,
      isEmployee,
      isGuide,
      hasBookingAccess,
      hasAdminAccess
    });
    
    return {
      hasBookingAccess,
      hasAdminAccess,
      isOwner,
      isAdmin,
      isEmployee,
      isGuide
    };
  };

  const permissions = checkUserPermissions();

  // Helper function to check if booking can be deleted
  const canDeleteBooking = (booking) => {
    // Updated delete logic: Owner can delete any booking except completed and on_tour
    const deletableStatuses = ['pending', 'cancelled', 'confirmed'];
    const canDelete = permissions.hasAdminAccess && deletableStatuses.includes(booking.status);
    
    console.log('🔍 Can Delete Booking Check:', {
      bookingId: booking.id,
      bookingStatus: booking.status,
      hasAdminAccess: permissions.hasAdminAccess,
      deletableStatuses,
      canDelete
    });
    return canDelete;
  };

  // Helper function to check if booking can be edited
  const canEditBooking = (booking) => {
    const canEdit = permissions.hasAdminAccess;
    console.log('🔍 Can Edit Booking Check:', {
      bookingId: booking.id,
      hasAdminAccess: permissions.hasAdminAccess,
      canEdit
    });
    return canEdit;
  };

  // Filter bookings based on current filter and date
  const filteredBookings = bookings.filter(booking => {
    const bookingDate = new Date(booking.selectedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (filter) {
      case 'upcoming':
        return bookingDate >= today && booking.status !== 'completed';
      case 'past':
        return bookingDate < today || booking.status === 'completed';
      case 'active':
        return booking.status === 'on_tour';
      default:
        return true;
    }
  }).sort((a, b) => new Date(a.selectedDate + 'T' + a.selectedTime) - new Date(b.selectedDate + 'T' + b.selectedTime));

  // Get bookings for selected date in calendar view
  const dailyBookings = bookings.filter(booking => 
    booking.selectedDate === selectedDate
  );

  const handleStartTour = async (bookingId) => {
    try {
      await dispatch(startTour(bookingId)).unwrap();
      
      // Update vehicle statuses to 'in_tour'
      const booking = bookings.find(b => b.id === bookingId);
      if (booking?.quadSelection?.selectedQuads) {
        for (const quad of booking.quadSelection.selectedQuads) {
          dispatch(updateVehicleStatus({ 
            vehicleId: quad.quadId, 
            status: 'in_tour' 
          }));
        }
      }
      
      toast.success('Tour started successfully!');
    } catch (error) {
      toast.error('Failed to start tour: ' + error.message);
    }
  };

  const handleFinishTour = async (bookingId) => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      const startTime = new Date(booking.selectedDate + 'T' + booking.selectedTime);
      const endTime = new Date();
      const actualDuration = Math.round((endTime - startTime) / (1000 * 60 * 60 * 100)) / 10; // hours with 1 decimal

      await dispatch(finishTour({ 
        bookingId, 
        actualDuration,
        endTime: endTime.toISOString()
      })).unwrap();
      
      // Update vehicle statuses back to 'available'
      if (booking?.quadSelection?.selectedQuads) {
        for (const quad of booking.quadSelection.selectedQuads) {
          dispatch(updateVehicleStatus({ 
            vehicleId: quad.quadId, 
            status: 'available' 
          }));
        }
      }
      
      toast.success(`Tour completed! Duration: ${actualDuration} hours`);
    } catch (error) {
      toast.error('Failed to finish tour: ' + error.message);
    }
  };

  const handleDeleteClick = (booking) => {
    setSelectedBooking(booking);
    setDeleteModalOpen(true);
  };

  const handleEditClick = (booking) => {
    // For now, just show a toast. Later this can open an edit modal
    toast.info('Edit functionality will be implemented soon');
    console.log('Edit booking:', booking);
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setDetailsModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    // Refresh bookings after successful deletion
    dispatch(fetchAllBookings());
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'on_tour': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed';
      case 'on_tour': return 'On Tour';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Pending';
      default: return 'Unknown';
    }
  };

  const canStartTour = (booking) => {
    const bookingDateTime = new Date(booking.selectedDate + 'T' + booking.selectedTime);
    const now = new Date();
    const timeDiff = Math.abs(now - bookingDateTime) / (1000 * 60); // minutes
    
    return booking.status === 'confirmed' && timeDiff <= 30; // Can start 30 minutes before/after scheduled time
  };

  const canFinishTour = (booking) => {
    return booking.status === 'on_tour';
  };

  if (!permissions.hasBookingAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <DebugAuthState />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">You need employee, guide, admin, or owner access to view bookings.</p>
          <div className="mt-4 text-sm text-gray-600">
            <p>Current user: {authState?.user?.email}</p>
            <p>User roles: {JSON.stringify(authState?.userRoles)}</p>
            <p>Has booking access: {permissions.hasBookingAccess ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Debug component - shows for admin users */}
      {permissions.hasAdminAccess && <DebugAuthState />}
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tours & Bookings Management</h1>
          <p className="text-gray-600">Track and manage all tour bookings and fleet assignments</p>
          {/* Debug info for admin users */}
          {permissions.hasAdminAccess && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
              Admin Access: Owner={permissions.isOwner ? 'Yes' : 'No'} | Admin={permissions.isAdmin ? 'Yes' : 'No'} | User: {authState?.user?.email}
              <br />Deletable Statuses: pending, cancelled, confirmed
            </div>
          )}
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List size={18} />
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                viewMode === 'calendar' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar size={18} />
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Bookings</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active Tours</option>
          <option value="past">Past Bookings</option>
        </select>
        
        {viewMode === 'calendar' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading bookings...</p>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && !loading && (
        <div className="space-y-4">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
              <p className="text-gray-600">No bookings match your current filter criteria.</p>
            </div>
          ) : (
            filteredBookings.map((booking) => (
              <div key={booking.id} className="bg-white rounded-lg shadow-md border hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    {/* Booking Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {booking.tourName || 'ATV Tour'}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(booking.status)}`}>
                          {getStatusText(booking.status)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} />
                          <span>{new Date(booking.selectedDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          <span>{booking.selectedTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users size={16} />
                          <span>{booking.participants?.length || 0} participants</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Car size={16} />
                          <span>{booking.quadSelection?.totalQuads || 0} quads</span>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="mt-3 text-sm text-gray-600">
                        <span className="font-medium">Customer:</span> {booking.customerName}
                        {booking.customerEmail && (
                          <span className="ml-4">
                            <span className="font-medium">Email:</span> {booking.customerEmail}
                          </span>
                        )}
                      </div>

                      {/* Debug info for admin users */}
                      {permissions.hasAdminAccess && (
                        <div className="mt-2 text-xs text-blue-600">
                          Can Edit: {canEditBooking(booking) ? 'Yes' : 'No'} | Can Delete: {canDeleteBooking(booking) ? 'Yes' : 'No'}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                      {/* Primary Actions */}
                      <div className="flex gap-2">
                        {canStartTour(booking) && (
                          <button
                            onClick={() => handleStartTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                          >
                            <Play size={16} />
                            START
                          </button>
                        )}
                        
                        {canFinishTour(booking) && (
                          <button
                            onClick={() => handleFinishTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            <Square size={16} />
                            FINISH
                          </button>
                        )}
                      </div>

                      {/* Secondary Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(booking)}
                          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                          <Eye size={14} />
                          View
                        </button>

                        {/* Edit Button - Show for admin/owner users */}
                        {canEditBooking(booking) && (
                          <button
                            onClick={() => handleEditClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                        )}

                        {/* Delete Button - Show for admin/owner users on deletable bookings */}
                        {canDeleteBooking(booking) && (
                          <button
                            onClick={() => handleDeleteClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && !loading && (
        <div className="bg-white rounded-lg shadow-md border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              Bookings for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h3>
          </div>
          
          <div className="p-6">
            {dailyBookings.length === 0 ? (
              <div className="text-center py-8">
                <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No bookings scheduled for this date.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dailyBookings
                  .sort((a, b) => a.selectedTime.localeCompare(b.selectedTime))
                  .map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-semibold text-gray-900">
                          {booking.selectedTime}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{booking.tourName || 'ATV Tour'}</div>
                          <div className="text-sm text-gray-600">
                            {booking.customerName} • {booking.participants?.length || 0} participants • {booking.quadSelection?.totalQuads || 0} quads
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(booking.status)}`}>
                          {getStatusText(booking.status)}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(booking)}
                          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                          <Eye size={14} />
                          View
                        </button>

                        {/* Edit Button - Show for admin/owner users */}
                        {canEditBooking(booking) && (
                          <button
                            onClick={() => handleEditClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                        )}

                        {canStartTour(booking) && (
                          <button
                            onClick={() => handleStartTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <Play size={16} />
                            START
                          </button>
                        )}
                        
                        {canFinishTour(booking) && (
                          <button
                            onClick={() => handleFinishTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <Square size={16} />
                            FINISH
                          </button>
                        )}

                        {/* Delete Button - Show for admin/owner users on deletable bookings */}
                        {canDeleteBooking(booking) && (
                          <button
                            onClick={() => handleDeleteClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <BookingDeleteModal
        booking={selectedBooking}
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedBooking(null);
        }}
        onSuccess={handleDeleteSuccess}
      />

      {/* Details Modal */}
      {detailsModalOpen && (
        <BookingDetailsModal
          booking={selectedBooking}
          isOpen={detailsModalOpen}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedBooking(null);
          }}
          onEdit={handleEditClick}
          onDelete={handleDeleteSuccess}
        />
      )}
    </div>
  );
};

export default Bookings;