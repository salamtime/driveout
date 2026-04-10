import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Calendar, List, Clock, Users, MapPin, Car, Play, Square, Trash2, Eye, Edit } from 'lucide-react';
import { startTour, finishTour, fetchAllBookings } from '../store/slices/bookingsSlice';
import { updateVehicleStatus } from '../store/slices/vehiclesSlice';
import BookingDeleteModal from '../components/admin/BookingDeleteModal';
import BookingDetailsModal from '../components/admin/BookingDetailsModal';
import DebugAuthState from '../components/DebugAuthState';
import toast from 'react-hot-toast';
import i18n from '../i18n';

const Bookings = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector(state => state.bookings || { bookings: [], loading: false });
  const authState = useSelector(state => state.auth);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filter, setFilter] = useState('all'); // 'all', 'upcoming', 'past', 'active'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
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

  const pageCount = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const paginatedBookings = filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, pageSize, viewMode]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

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
      
      toast.success(tr('Tour started successfully!', 'Tour démarré avec succès !'));
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
      
      toast.success(`${tr('Tour completed! Duration:', 'Tour terminé ! Durée :')} ${actualDuration} ${tr('hours', 'heures')}`);
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
      case 'confirmed': return tr('Confirmed', 'Confirmée');
      case 'on_tour': return tr('On Tour', 'En tour');
      case 'completed': return tr('Completed', 'Terminée');
      case 'cancelled': return tr('Cancelled', 'Annulée');
      case 'pending': return tr('Pending', 'En attente');
      default: return tr('Unknown', 'Inconnu');
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
          <h2 className="text-xl font-semibold text-red-800 mb-2">{tr('Access Denied', 'Accès refusé')}</h2>
          <p className="text-red-600">{tr('You need employee, guide, admin, or owner access to view bookings.', "Vous devez avoir un accès employé, guide, admin ou propriétaire pour voir les réservations.")}</p>
          <div className="mt-4 text-sm text-gray-600">
            <p>{tr('Current user', 'Utilisateur actuel')}: {authState?.user?.email}</p>
            <p>{tr('User roles', 'Rôles utilisateur')}: {JSON.stringify(authState?.userRoles)}</p>
            <p>{tr('Has booking access', "A l'accès réservations")}: {permissions.hasBookingAccess ? tr('Yes', 'Oui') : tr('No', 'Non')}</p>
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr('Tours & Bookings Management', 'Gestion des tours et reservations')}</h1>
          <p className="text-gray-600">{tr('Track and manage all tour bookings and fleet assignments', 'Suivez et gerez toutes les reservations de tours et les affectations de flotte')}</p>
          {/* Debug info for admin users */}
          {permissions.hasAdminAccess && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
              {tr('Admin Access', 'Acces admin')}: {tr('Owner', 'Proprietaire')}={permissions.isOwner ? tr('Yes', 'Oui') : tr('No', 'Non')} | {tr('Admin', 'Admin')}={permissions.isAdmin ? tr('Yes', 'Oui') : tr('No', 'Non')} | {tr('User', 'Utilisateur')}: {authState?.user?.email}
              <br />{tr('Deletable Statuses', 'Statuts supprimables')}: {tr('pending, cancelled, confirmed', 'en attente, annule, confirme')}
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
              {tr('List', 'Liste')}
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
              {tr('Calendar', 'Calendrier')}
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
          <option value="all">{tr('All Bookings', 'Toutes les reservations')}</option>
          <option value="upcoming">{tr('Upcoming', 'A venir')}</option>
          <option value="active">{tr('Active Tours', 'Tours actifs')}</option>
          <option value="past">{tr('Past Bookings', 'Reservations passees')}</option>
        </select>
        
        {viewMode === 'calendar' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}

        {viewMode === 'list' && (
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="10">{tr('Show 10', 'Afficher 10')}</option>
            <option value="25">{tr('Show 25', 'Afficher 25')}</option>
          </select>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">{tr('Loading bookings...', 'Chargement des reservations...')}</p>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && !loading && (
        <div className="space-y-4">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{tr('No bookings found', 'Aucune reservation trouvee')}</h3>
              <p className="text-gray-600">{tr('No bookings match your current filter criteria.', 'Aucune reservation ne correspond a vos filtres actuels.')}</p>
            </div>
          ) : (
            paginatedBookings.map((booking) => (
              <div key={booking.id} className="bg-white rounded-lg shadow-md border hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    {/* Booking Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {booking.tourName || tr('ATV Tour', 'Tour ATV')}
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
                          <span>{booking.participants?.length || 0} {tr('participants', 'participants')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Car size={16} />
                          <span>{booking.quadSelection?.totalQuads || 0} quads</span>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="mt-3 text-sm text-gray-600">
                          <span className="font-medium">{tr('Customer', 'Client')}:</span> {booking.customerName}
                        {booking.customerEmail && (
                          <span className="ml-4">
                            <span className="font-medium">Email:</span> {booking.customerEmail}
                          </span>
                        )}
                      </div>

                      {/* Debug info for admin users */}
                      {permissions.hasAdminAccess && (
                        <div className="mt-2 text-xs text-blue-600">
                          {tr('Can Edit', 'Peut modifier')}: {canEditBooking(booking) ? tr('Yes', 'Oui') : tr('No', 'Non')} | {tr('Can Delete', 'Peut supprimer')}: {canDeleteBooking(booking) ? tr('Yes', 'Oui') : tr('No', 'Non')}
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
                            {tr('START', 'DÉMARRER')}
                          </button>
                        )}
                        
                        {canFinishTour(booking) && (
                          <button
                            onClick={() => handleFinishTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            <Square size={16} />
                            {tr('FINISH', 'TERMINER')}
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
                          {tr('View', 'Voir')}
                        </button>

                        {/* Edit Button - Show for admin/owner users */}
                        {canEditBooking(booking) && (
                          <button
                            onClick={() => handleEditClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                          >
                            <Edit size={14} />
                            {tr('Edit', 'Modifier')}
                          </button>
                        )}

                        {/* Delete Button - Show for admin/owner users on deletable bookings */}
                        {canDeleteBooking(booking) && (
                          <button
                            onClick={() => handleDeleteClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
                          >
                            <Trash2 size={14} />
                            {tr('Delete', 'Supprimer')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {filteredBookings.length > 0 && pageCount > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-600">
                {tr('Page', 'Page')} {currentPage} {tr('of', 'sur')} {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tr('Previous', 'Précédent')}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(pageCount, prev + 1))}
                  disabled={currentPage === pageCount}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tr('Next', 'Suivant')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && !loading && (
        <div className="bg-white rounded-lg shadow-md border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {tr('Bookings for', 'Réservations du')} {new Date(selectedDate).toLocaleDateString('fr-FR', { 
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
                <p className="text-gray-600">{tr('No bookings scheduled for this date.', 'Aucune réservation prévue pour cette date.')}</p>
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
                          <div className="font-medium text-gray-900">{booking.tourName || tr('ATV Tour', 'Tour ATV')}</div>
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
                          {tr('View', 'Voir')}
                        </button>

                        {/* Edit Button - Show for admin/owner users */}
                        {canEditBooking(booking) && (
                          <button
                            onClick={() => handleEditClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                          >
                            <Edit size={14} />
                            {tr('Edit', 'Modifier')}
                          </button>
                        )}

                        {canStartTour(booking) && (
                          <button
                            onClick={() => handleStartTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <Play size={16} />
                            {tr('START', 'DÉMARRER')}
                          </button>
                        )}
                        
                        {canFinishTour(booking) && (
                          <button
                            onClick={() => handleFinishTour(booking.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <Square size={16} />
                            {tr('FINISH', 'TERMINER')}
                          </button>
                        )}

                        {/* Delete Button - Show for admin/owner users on deletable bookings */}
                        {canDeleteBooking(booking) && (
                          <button
                            onClick={() => handleDeleteClick(booking)}
                            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
                          >
                            <Trash2 size={14} />
                            {tr('Delete', 'Supprimer')}
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
