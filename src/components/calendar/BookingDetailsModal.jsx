import React from 'react';
import { X, Clock, User, MapPin, Phone, Mail, Calendar, Play, Square, Edit } from 'lucide-react';
import i18n from '../../i18n';

const BookingDetailsModal = ({ booking, isOpen, onClose, onStart, onFinish, onEdit }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  if (!isOpen || !booking) return null;

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

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{getStatusIcon(booking.status)}</span>
            <div>
              <h2 className="text-2xl font-black text-gray-900">{booking.tourName}</h2>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(booking.status)}`}>
                {tr('Status:', 'Statut :')} {booking.status.replace('_', ' ').toUpperCase()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Tour Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2">📅 {tr('Tour Information', 'Informations du tour')}</h3>
              
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-semibold">{tr('Date & Time', 'Date et heure')}</div>
                  <div className="text-gray-600">{booking.selectedDate} {tr('at', 'à')} {booking.selectedTime}</div>
                </div>
              </div>

              {booking.duration && (
                <div className="flex items-center space-x-3">
                  <Clock className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-semibold">{tr('Duration', 'Durée')}</div>
                    <div className="text-gray-600">{formatDuration(booking.duration)}</div>
                  </div>
                </div>
              )}

              {booking.assignedGuide && (
                <div className="flex items-center space-x-3">
                  <User className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="font-semibold">{tr('Assigned Guide', 'Guide assigné')}</div>
                    <div className="text-gray-600">{booking.assignedGuide}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2">👥 {tr('Participants', 'Participants')}</h3>
              
              {booking.participants && booking.participants.length > 0 ? (
                <div className="space-y-3">
                  {booking.participants.map((participant, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                      <div className="font-semibold">{participant.name}</div>
                      <div className="text-sm text-gray-600">
                        {tr('Age:', 'Âge :')} {participant.age}
                        {participant.email && <span className="ml-2">• {participant.email}</span>}
                      </div>
                      {participant.emergencyContact && (
                        <div className="text-sm text-gray-600">
                          {tr('Emergency:', 'Urgence :')} {participant.emergencyContact}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 italic">{tr('No participant details available', 'Aucun détail participant disponible')}</div>
              )}
            </div>
          </div>

          {/* Vehicle Information */}
          {booking.quadSelection && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2">🏍️ {tr('Vehicle Assignment', 'Attribution du véhicule')}</h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold">{booking.quadSelection.quadName}</div>
                <div className="text-sm text-gray-600">
                  {tr('Vehicle ID:', 'ID véhicule :')} {booking.quadSelection.quadId}
                </div>
              </div>
            </div>
          )}

          {/* Timing Information */}
          {(booking.startTime || booking.endTime) && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2">⏱️ {tr('Tour Timing', 'Chronologie du tour')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {booking.startTime && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="font-semibold text-green-800">{tr('Started At', 'Commencé à')}</div>
                    <div className="text-sm text-green-600">
                      {new Date(booking.startTime).toLocaleString()}
                    </div>
                  </div>
                )}
                {booking.endTime && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="font-semibold text-gray-800">{tr('Finished At', 'Terminé à')}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(booking.endTime).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
              {booking.actualDuration && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="font-semibold text-blue-800">{tr('Actual Duration', 'Durée réelle')}</div>
                  <div className="text-sm text-blue-600">
                    {formatDuration(booking.actualDuration)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">ℹ️ {tr('Additional Details', 'Détails supplémentaires')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">{tr('Booking ID:', 'ID réservation :')}</span>
                <span className="ml-2 text-gray-600">{booking.id}</span>
              </div>
              <div>
                <span className="font-semibold">{tr('Created:', 'Créé le :')}</span>
                <span className="ml-2 text-gray-600">
                  {new Date(booking.createdAt).toLocaleDateString()}
                </span>
              </div>
              {booking.totalPrice && (
                <div>
                  <span className="font-semibold">{tr('Total Price:', 'Prix total :')}</span>
                  <span className="ml-2 text-gray-600">${booking.totalPrice}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 p-6 border-t-2 border-gray-200 bg-gray-50">
          {booking.status === 'confirmed' && onStart && (
            <button
              onClick={() => onStart(booking)}
              className="flex items-center space-x-2 px-6 py-3 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors"
            >
              <Play className="h-5 w-5" />
              <span>{tr('START TOUR', 'COMMENCER LE TOUR')}</span>
            </button>
          )}
          
          {booking.status === 'on_tour' && onFinish && (
            <button
              onClick={() => onFinish(booking)}
              className="flex items-center space-x-2 px-6 py-3 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
            >
              <Square className="h-5 w-5" />
              <span>{tr('FINISH TOUR', 'TERMINER LE TOUR')}</span>
            </button>
          )}
          
          {onEdit && ['confirmed', 'pending'].includes(booking.status) && (
            <button
              onClick={() => onEdit(booking)}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition-colors"
            >
              <Edit className="h-5 w-5" />
              <span>{tr('EDIT BOOKING', 'MODIFIER LA RÉSERVATION')}</span>
            </button>
          )}
          
          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-6 py-3 bg-gray-500 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors ml-auto"
          >
            <X className="h-5 w-5" />
            <span>{tr('CLOSE', 'FERMER')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailsModal;
