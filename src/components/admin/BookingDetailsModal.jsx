import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, Calendar, Clock, Users, Car, MapPin, DollarSign, Phone, Mail, FileText, Edit, Trash2 } from 'lucide-react';
import { deleteBooking } from '../../store/slices/bookingsSlice';
import toast from 'react-hot-toast';

const BookingDetailsModal = ({ booking, isOpen, onClose, onEdit, onDelete }) => {
  const dispatch = useDispatch();
  const authState = useSelector(state => state.auth);

  if (!isOpen || !booking) return null;

  // Comprehensive role checking function with extensive logging
  const checkUserPermissions = () => {
    console.log('🔍 BOOKING DETAILS MODAL - Permission Check Started');
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
    
    const hasAdminAccess = isOwner || isAdmin;
    
    // Updated delete logic: Owner can delete any booking except completed and on_tour
    const deletableStatuses = ['pending', 'cancelled', 'confirmed'];
    const canDeleteStatus = deletableStatuses.includes(booking?.status);
    
    console.log('🔍 Permission Results:', {
      isOwner,
      isAdmin,
      hasAdminAccess,
      bookingStatus: booking?.status,
      deletableStatuses,
      canDeleteStatus
    });
    
    return {
      canEdit: hasAdminAccess,
      canDelete: hasAdminAccess && canDeleteStatus,
      isOwner,
      isAdmin,
      hasAdminAccess
    };
  };

  const permissions = checkUserPermissions();

  const handleDelete = async () => {
    if (!permissions.canDelete) {
      toast.error('You do not have permission to delete this booking');
      return;
    }

    // Additional safety check for active tours
    if (booking.status === 'on_tour') {
      toast.error('Cannot delete an active tour. Please finish the tour first.');
      return;
    }

    const confirmMessage = booking.status === 'confirmed' 
      ? 'Are you sure you want to delete this CONFIRMED booking? This will cancel the customer\'s reservation and cannot be undone.'
      : 'Are you sure you want to delete this booking? This action cannot be undone.';

    if (window.confirm(confirmMessage)) {
      try {
        await dispatch(deleteBooking(booking.id)).unwrap();
        toast.success('Booking deleted successfully');
        onClose();
        if (onDelete) onDelete();
      } catch (error) {
        console.error('Error deleting booking:', error);
        toast.error('Failed to delete booking: ' + error.message);
      }
    }
  };

  const handleEdit = () => {
    if (!permissions.canEdit) {
      toast.error('You do not have permission to edit this booking');
      return;
    }
    
    if (onEdit) {
      onEdit(booking);
    } else {
      toast.info('Edit functionality will be implemented soon');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'on_tour': return 'bg-green-100 text-green-800 border-green-200';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'partial': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unpaid': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Booking Details</h2>
            <p className="text-gray-600 mt-1">Complete information for booking #{booking.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Debug Info for Admin Users */}
          {permissions.hasAdminAccess && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">🔍 Debug Info (Admin Only)</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <div>User: {authState?.user?.email}</div>
                <div>User Roles Array: {JSON.stringify(authState?.userRoles)}</div>
                <div>User Role Direct: {authState?.user?.role}</div>
                <div>User Metadata Role: {authState?.user?.user_metadata?.role}</div>
                <div>App Metadata Role: {authState?.user?.app_metadata?.role}</div>
                <div>Is Owner: {permissions.isOwner ? 'Yes' : 'No'}</div>
                <div>Is Admin: {permissions.isAdmin ? 'Yes' : 'No'}</div>
                <div>Can Edit: {permissions.canEdit ? 'Yes' : 'No'}</div>
                <div>Can Delete: {permissions.canDelete ? 'Yes' : 'No'}</div>
                <div>Booking Status: {booking.status}</div>
                <div>Deletable Statuses: pending, cancelled, confirmed</div>
              </div>
            </div>
          )}

          {/* Status and Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Booking Status</h3>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-2 rounded-lg text-sm font-medium border ${getStatusColor(booking.status)}`}>
                    {booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1) || 'Unknown'}
                  </span>
                  <span className={`px-3 py-2 rounded-lg text-sm font-medium border ${getPaymentStatusColor(booking.paymentStatus)}`}>
                    Payment: {booking.paymentStatus?.charAt(0).toUpperCase() + booking.paymentStatus?.slice(1) || 'Unknown'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Tour Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span>{new Date(booking.selectedDate).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>{booking.selectedTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span>{booking.tourName || 'ATV Tour'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Customer Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{booking.customerName}</span>
                  </div>
                  {booking.customerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <a href={`mailto:${booking.customerEmail}`} className="text-blue-600 hover:text-blue-800">
                        {booking.customerEmail}
                      </a>
                    </div>
                  )}
                  {booking.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <a href={`tel:${booking.phone}`} className="text-blue-600 hover:text-blue-800">
                        {booking.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Financial Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-medium">${booking.totalAmount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Deposit:</span>
                    <span className="font-medium">${booking.deposit?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Remaining:</span>
                    <span className="font-medium">
                      ${((booking.totalAmount || 0) - (booking.deposit || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Participants */}
          {booking.participants && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Participants</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                {Array.isArray(booking.participants) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {booking.participants.map((participant, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border">
                        <div className="font-medium text-gray-900">{participant.name}</div>
                        {participant.age && (
                          <div className="text-sm text-gray-600">Age: {participant.age}</div>
                        )}
                        {participant.experience && (
                          <div className="text-sm text-gray-600">Experience: {participant.experience}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-blue-600">{booking.participants.adults || 0}</div>
                      <div className="text-sm text-gray-600">Adults</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-green-600">{booking.participants.children || 0}</div>
                      <div className="text-sm text-gray-600">Children</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-purple-600">{booking.participants.infants || 0}</div>
                      <div className="text-sm text-gray-600">Infants</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assigned Quads */}
          {booking.quadSelection?.selectedQuads && booking.quadSelection.selectedQuads.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Assigned Vehicles</h3>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {booking.quadSelection.selectedQuads.map((quad, index) => (
                    <div key={index} className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Car className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">{quad.quadName}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>Quad ID: {quad.quadId}</div>
                        <div>Participants: {quad.participantCount || 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-sm text-blue-700">
                  Total Quads: {booking.quadSelection.totalQuads} | Total Participants: {booking.quadSelection.totalParticipants}
                </div>
              </div>
            </div>
          )}

          {/* Tour Timeline */}
          {(booking.startTime || booking.endTime) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Tour Timeline</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-3">
                  {booking.startTime && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-gray-900">Tour Started</div>
                        <div className="text-sm text-gray-600">
                          {new Date(booking.startTime).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                  {booking.endTime && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-gray-900">Tour Completed</div>
                        <div className="text-sm text-gray-600">
                          {new Date(booking.endTime).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                  {booking.actualDuration && (
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="font-medium text-gray-900">Actual Duration</div>
                        <div className="text-sm text-gray-600">{booking.actualDuration} minutes</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes and Special Requests */}
          {(booking.notes || booking.specialRequests) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Additional Information</h3>
              <div className="space-y-4">
                {booking.notes && (
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h4 className="font-medium text-yellow-900 mb-2">Notes</h4>
                    <p className="text-sm text-yellow-800 whitespace-pre-wrap">{booking.notes}</p>
                  </div>
                )}
                {booking.specialRequests && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h4 className="font-medium text-purple-900 mb-2">Special Requests</h4>
                    <p className="text-sm text-purple-800 whitespace-pre-wrap">{booking.specialRequests}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Booking Metadata</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Booking ID:</span>
                  <span className="ml-2 font-mono text-gray-900">{booking.id}</span>
                </div>
                <div>
                  <span className="text-gray-600">Tour ID:</span>
                  <span className="ml-2 font-mono text-gray-900">{booking.tourId || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Created:</span>
                  <span className="ml-2 text-gray-900">
                    {booking.createdAt ? new Date(booking.createdAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="ml-2 text-gray-900">
                    {booking.updatedAt ? new Date(booking.updatedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Action Buttons */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            Booking #{booking.id} • {booking.status}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            
            {/* Edit Button - Show for admin/owner users */}
            {permissions.canEdit && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="h-4 w-4" />
                Edit Booking
              </button>
            )}
            
            {/* Delete Button - Show for admin/owner users on deletable bookings */}
            {permissions.canDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete Booking
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailsModal;