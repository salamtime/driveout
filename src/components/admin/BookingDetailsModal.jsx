import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, Calendar, Clock, Users, Car, MapPin, DollarSign, Phone, Mail, FileText, Edit, Trash2 } from 'lucide-react';
import { deleteBooking } from '../../store/slices/bookingsSlice';
import toast from 'react-hot-toast';
import i18n from '../../i18n';

const BookingDetailsModal = ({ booking, isOpen, onClose, onEdit, onDelete }) => {
  const dispatch = useDispatch();
  const authState = useSelector(state => state.auth);
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

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
      toast.error(tr("Vous n'avez pas l'autorisation de supprimer cette réservation", "Vous n'avez pas l'autorisation de supprimer cette réservation"));
      return;
    }

    // Additional safety check for active tours
    if (booking.status === 'on_tour') {
      toast.error(tr('Impossible de supprimer un tour actif. Veuillez d’abord terminer le tour.', 'Impossible de supprimer un tour actif. Veuillez d’abord terminer le tour.'));
      return;
    }

    const confirmMessage = booking.status === 'confirmed' 
      ? tr("Êtes-vous sûr de vouloir supprimer cette réservation CONFIRMÉE ? Cela annulera la réservation du client et cette action est irréversible.", "Êtes-vous sûr de vouloir supprimer cette réservation CONFIRMÉE ? Cela annulera la réservation du client et cette action est irréversible.")
      : tr("Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action est irréversible.", "Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action est irréversible.");

    if (window.confirm(confirmMessage)) {
      try {
        await dispatch(deleteBooking(booking.id)).unwrap();
        toast.success(tr('Réservation supprimée avec succès', 'Réservation supprimée avec succès'));
        onClose();
        if (onDelete) onDelete();
      } catch (error) {
        console.error('Error deleting booking:', error);
        toast.error(`${tr('Échec de la suppression de la réservation :', 'Échec de la suppression de la réservation :')} ${error.message}`);
      }
    }
  };

  const handleEdit = () => {
    if (!permissions.canEdit) {
      toast.error(tr("Vous n'avez pas l'autorisation de modifier cette réservation", "Vous n'avez pas l'autorisation de modifier cette réservation"));
      return;
    }
    
    if (onEdit) {
      onEdit(booking);
    } else {
      toast.info(tr('La modification sera disponible bientôt', 'La modification sera disponible bientôt'));
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
            <h2 className="text-2xl font-bold text-gray-900">{tr('Détails de la réservation', 'Détails de la réservation')}</h2>
            <p className="text-gray-600 mt-1">{tr(`Informations complètes pour la réservation n°${booking.id}`, `Informations complètes pour la réservation n°${booking.id}`)}</p>
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
              <h4 className="font-medium text-blue-900 mb-2">🔍 {tr('Infos de débogage (admin uniquement)', 'Infos de débogage (admin uniquement)')}</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <div>{tr('Utilisateur', 'Utilisateur')} : {authState?.user?.email}</div>
                <div>{tr('Tableau des rôles utilisateur', 'Tableau des rôles utilisateur')} : {JSON.stringify(authState?.userRoles)}</div>
                <div>{tr('Rôle utilisateur direct', 'Rôle utilisateur direct')} : {authState?.user?.role}</div>
                <div>{tr('Rôle des métadonnées utilisateur', 'Rôle des métadonnées utilisateur')} : {authState?.user?.user_metadata?.role}</div>
                <div>{tr("Rôle des métadonnées de l'application", "Rôle des métadonnées de l'application")} : {authState?.user?.app_metadata?.role}</div>
                <div>{tr('Est propriétaire', 'Est propriétaire')} : {permissions.isOwner ? tr('Oui', 'Oui') : tr('Non', 'Non')}</div>
                <div>{tr('Est admin', 'Est admin')} : {permissions.isAdmin ? tr('Oui', 'Oui') : tr('Non', 'Non')}</div>
                <div>{tr('Peut modifier', 'Peut modifier')} : {permissions.canEdit ? tr('Oui', 'Oui') : tr('Non', 'Non')}</div>
                <div>{tr('Peut supprimer', 'Peut supprimer')} : {permissions.canDelete ? tr('Oui', 'Oui') : tr('Non', 'Non')}</div>
                <div>{tr('Statut de réservation', 'Statut de réservation')} : {booking.status}</div>
                <div>{tr('Statuts supprimables', 'Statuts supprimables')} : pending, cancelled, confirmed</div>
              </div>
            </div>
          )}

          {/* Status and Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Statut de la réservation', 'Statut de la réservation')}</h3>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-2 rounded-lg text-sm font-medium border ${getStatusColor(booking.status)}`}>
                    {booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1) || tr('Inconnu', 'Inconnu')}
                  </span>
                  <span className={`px-3 py-2 rounded-lg text-sm font-medium border ${getPaymentStatusColor(booking.paymentStatus)}`}>
                    {tr('Paiement', 'Paiement')} : {booking.paymentStatus?.charAt(0).toUpperCase() + booking.paymentStatus?.slice(1) || tr('Inconnu', 'Inconnu')}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">{tr('Informations du tour', 'Informations du tour')}</h4>
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
                    <span>{booking.tourName || tr('Tour en quad', 'Tour en quad')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">{tr('Informations client', 'Informations client')}</h4>
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
                <h4 className="font-medium text-gray-900 mb-2">{tr('Financial Details', 'Détails financiers')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{tr('Total Amount:', 'Montant total :')}</span>
                    <span className="font-medium">${booking.totalAmount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{tr('Deposit:', 'Dépôt :')}</span>
                    <span className="font-medium">${booking.deposit?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{tr('Remaining:', 'Reste :')}</span>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Participants', 'Participants')}</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                {Array.isArray(booking.participants) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {booking.participants.map((participant, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border">
                        <div className="font-medium text-gray-900">{participant.name}</div>
                        {participant.age && (
                          <div className="text-sm text-gray-600">{tr('Age:', 'Âge :')} {participant.age}</div>
                        )}
                        {participant.experience && (
                          <div className="text-sm text-gray-600">{tr('Experience:', 'Expérience :')} {participant.experience}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-blue-600">{booking.participants.adults || 0}</div>
                      <div className="text-sm text-gray-600">{tr('Adults', 'Adultes')}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-green-600">{booking.participants.children || 0}</div>
                      <div className="text-sm text-gray-600">{tr('Children', 'Enfants')}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-2xl font-bold text-purple-600">{booking.participants.infants || 0}</div>
                      <div className="text-sm text-gray-600">{tr('Infants', 'Bébés')}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assigned Quads */}
          {booking.quadSelection?.selectedQuads && booking.quadSelection.selectedQuads.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Assigned Vehicles', 'Véhicules attribués')}</h3>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {booking.quadSelection.selectedQuads.map((quad, index) => (
                    <div key={index} className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Car className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">{quad.quadName}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>{tr('Quad ID:', 'ID quad :')} {quad.quadId}</div>
                        <div>{tr('Participants:', 'Participants :')} {quad.participantCount || 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-sm text-blue-700">
                  {tr('Total Quads:', 'Total quads :')} {booking.quadSelection.totalQuads} | {tr('Total Participants:', 'Total participants :')} {booking.quadSelection.totalParticipants}
                </div>
              </div>
            </div>
          )}

          {/* Tour Timeline */}
          {(booking.startTime || booking.endTime) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Tour Timeline', 'Chronologie du tour')}</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-3">
                  {booking.startTime && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-gray-900">{tr('Tour Started', 'Tour démarré')}</div>
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
                        <div className="font-medium text-gray-900">{tr('Tour Completed', 'Tour terminé')}</div>
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
                        <div className="font-medium text-gray-900">{tr('Actual Duration', 'Durée réelle')}</div>
                        <div className="text-sm text-gray-600">{booking.actualDuration} {tr('minutes', 'minutes')}</div>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Additional Information', 'Informations supplémentaires')}</h3>
              <div className="space-y-4">
                {booking.notes && (
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h4 className="font-medium text-yellow-900 mb-2">{tr('Notes', 'Notes')}</h4>
                    <p className="text-sm text-yellow-800 whitespace-pre-wrap">{booking.notes}</p>
                  </div>
                )}
                {booking.specialRequests && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h4 className="font-medium text-purple-900 mb-2">{tr('Special Requests', 'Demandes spéciales')}</h4>
                    <p className="text-sm text-purple-800 whitespace-pre-wrap">{booking.specialRequests}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Booking Metadata', 'Métadonnées de réservation')}</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">{tr('Booking ID:', 'ID réservation :')}</span>
                  <span className="ml-2 font-mono text-gray-900">{booking.id}</span>
                </div>
                <div>
                  <span className="text-gray-600">{tr('Tour ID:', 'ID tour :')}</span>
                  <span className="ml-2 font-mono text-gray-900">{booking.tourId || tr('N/D', 'N/D')}</span>
                </div>
                <div>
                  <span className="text-gray-600">{tr('Created:', 'Créé :')}</span>
                  <span className="ml-2 text-gray-900">
                    {booking.createdAt ? new Date(booking.createdAt).toLocaleString() : tr('N/D', 'N/D')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">{tr('Last Updated:', 'Dernière mise à jour :')}</span>
                  <span className="ml-2 text-gray-900">
                    {booking.updatedAt ? new Date(booking.updatedAt).toLocaleString() : tr('N/D', 'N/D')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Action Buttons */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {tr('Booking', 'Réservation')} #{booking.id} • {booking.status}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              {tr('Close', 'Fermer')}
            </button>
            
            {/* Edit Button - Show for admin/owner users */}
            {permissions.canEdit && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="h-4 w-4" />
                {tr('Edit Booking', 'Modifier la réservation')}
              </button>
            )}
            
            {/* Delete Button - Show for admin/owner users on deletable bookings */}
            {permissions.canDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {tr('Delete Booking', 'Supprimer la réservation')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailsModal;
