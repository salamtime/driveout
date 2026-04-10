import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { deleteBooking } from '../../store/slices/bookingsSlice';
import toast from 'react-hot-toast';
import i18n from '../../i18n';

const BookingDeleteModal = ({ booking, isOpen, onClose, onSuccess }) => {
  const dispatch = useDispatch();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen || !booking) return null;

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== 'delete') {
      toast.error(tr('Veuillez taper "DELETE" pour confirmer la suppression', 'Veuillez taper "DELETE" pour confirmer la suppression'));
      return;
    }

    setIsDeleting(true);
    try {
      await dispatch(deleteBooking(booking.id)).unwrap();
      toast.success(tr('Réservation supprimée avec succès', 'Réservation supprimée avec succès'));
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error(`${tr('Échec de la suppression de la réservation :', 'Échec de la suppression de la réservation :')} ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = () => {
    // Only allow deletion of certain statuses
    const deletableStatuses = ['pending', 'cancelled'];
    return deletableStatuses.includes(booking.status);
  };

  const getWarningMessage = () => {
    if (booking.status === 'confirmed') {
      return tr("Cette réservation est confirmée. Veuillez d'abord l'annuler avant de la supprimer.", "Cette réservation est confirmée. Veuillez d'abord l'annuler avant de la supprimer.");
    }
    if (booking.status === 'on_tour') {
      return tr("Impossible de supprimer un tour actif. Veuillez d'abord terminer le tour.", "Impossible de supprimer un tour actif. Veuillez d'abord terminer le tour.");
    }
    if (booking.status === 'completed') {
      return tr('Les réservations terminées ne peuvent pas être supprimées pour des raisons de conservation des dossiers.', 'Les réservations terminées ne peuvent pas être supprimées pour des raisons de conservation des dossiers.');
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{tr('Supprimer la réservation', 'Supprimer la réservation')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-red-800 mb-1">{tr('Attention : cette action est irréversible', 'Attention : cette action est irréversible')}</h3>
              <p className="text-sm text-red-700">
                {tr('La suppression de cette réservation retirera définitivement toutes les données associées, notamment :', 'La suppression de cette réservation retirera définitivement toutes les données associées, notamment :')}
              </p>
              <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                <li>{tr('Les informations client et les coordonnées', 'Les informations client et les coordonnées')}</li>
                <li>{tr('Les affectations de tour et allocations de quads', 'Les affectations de tour et allocations de quads')}</li>
                <li>{tr('Les paiements et l’historique des transactions', 'Les paiements et l’historique des transactions')}</li>
                <li>{tr('Toutes les notes et demandes spéciales', 'Toutes les notes et demandes spéciales')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Booking Details */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">{tr('Détails de la réservation', 'Détails de la réservation')}</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('ID réservation', 'ID réservation')} :</span>
              <span className="font-mono text-gray-900">{booking.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Client', 'Client')} :</span>
              <span className="text-gray-900">{booking.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Tour', 'Tour')} :</span>
              <span className="text-gray-900">{booking.tourName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Date', 'Date')} :</span>
              <span className="text-gray-900">
                {new Date(booking.selectedDate).toLocaleDateString()} {tr('à', 'à')} {booking.selectedTime}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Statut', 'Statut')} :</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                booking.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                booking.status === 'completed' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {booking.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Montant total', 'Montant total')} :</span>
              <span className="text-gray-900 font-medium">
                ${booking.totalAmount?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Status Check */}
        {!canDelete() && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-800 mb-1">{tr('Suppression impossible', 'Suppression impossible')}</h4>
                <p className="text-sm text-yellow-700">{getWarningMessage()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Input */}
        {canDelete() && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tr('Tapez "DELETE" pour confirmer la suppression :', 'Tapez "DELETE" pour confirmer la suppression :')}
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={tr('Tapez DELETE ici', 'Tapez DELETE ici')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={isDeleting}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isDeleting}
          >
            {tr('Annuler', 'Annuler')}
          </button>
          {canDelete() && (
            <button
              onClick={handleDelete}
              disabled={isDeleting || confirmText.toLowerCase() !== 'delete'}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  {tr('Suppression...', 'Suppression...')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {tr('Supprimer la réservation', 'Supprimer la réservation')}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingDeleteModal;
