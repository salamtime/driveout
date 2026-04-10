import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import i18n from '../../i18n';

const RentalDetailsModal = ({ rental, isOpen, onClose, onUpdate }) => {
  const { t } = useTranslation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Load vehicle details when rental changes
  useEffect(() => {
    if (isOpen && rental) {
      console.log('Data received in RentalDetailsModal:', rental);
    }

    const fetchVehicleDetails = async () => {
      if (!rental?.vehicle_id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .select('*')
          .eq('id', rental.vehicle_id)
          .single();
    
    console.log('📞 Fetched rental with customer info:', {
      rentalPhone: data.customer_phone,
      rentalEmail: data.customer_email,
      customerTablePhone: data.customer_info?.phone,
      customerTableEmail: data.customer_info?.email
    });

        if (error) {
          setError(tr('Échec du chargement des détails du véhicule', 'Échec du chargement des détails du véhicule'));
        } else {
          setVehicle(data);
        }
      } catch (err) {
        setError(tr('Échec du chargement des détails du véhicule', 'Échec du chargement des détails du véhicule'));
      } finally {
        setLoading(false);
      }
    };
    
    if (isOpen && rental) {
      fetchVehicleDetails();
    }
  }, [rental, isOpen]);
  
  const formatDate = (dateString) => {
    if (!dateString) return tr('Non défini', 'Non défini');
    try {
      return format(parseISO(dateString), 'PPP p');
    } catch (error) {
      return tr('Date invalide', 'Date invalide');
    }
  };
  
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'rented':
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const handleStatusUpdate = async (newStatus) => {
    if (!rental) return;
    
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (onUpdate) {
        onUpdate(data);
      }
      
    } catch (err) {
      setError(tr('Échec de la mise à jour du statut de location', 'Échec de la mise à jour du statut de location'));
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen || !rental) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {tr('Détails de la location', 'Détails de la location')}
            </h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              aria-label={tr('Fermer', 'Fermer')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Rental Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {tr('Informations de location', 'Informations de location')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('ID location', 'ID location')} :</span>
                    <span className="font-medium">{rental.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Statut', 'Statut')} :</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(rental.rental_status)}`}>
                      {rental.rental_status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Date de début', 'Date de début')} :</span>
                    <span className="font-medium">{formatDate(rental.rental_start_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Date de fin', 'Date de fin')} :</span>
                    <span className="font-medium">{formatDate(rental.rental_end_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Montant total', 'Montant total')} :</span>
                    <span className="font-medium">{rental.total_amount} MAD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Montant du dépôt', 'Montant du dépôt')} :</span>
                    <span className="font-medium">{rental.deposit_amount} MAD</span>
                  </div>
                </div>
              </div>
              
              {/* Customer Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {tr('Informations client', 'Informations client')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Nom', 'Nom')} :</span>
                    <span className="font-medium">{rental.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('E-mail', 'E-mail')} :</span>
                    <span className="font-medium">{rental.customer_email}</span>
                  </div>
                  {rental.customer_phone && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{tr('Téléphone', 'Téléphone')} :</span>
                      <span className="font-medium">{rental.customer_phone}</span>
                    </div>
                  )}
                  {rental.customer_id_image && (
                    <div>
                      <span className="text-gray-600">{tr('Pièce client', 'Pièce client')} :</span>
                      <img src={rental.customer_id_image} alt={tr('Pièce client', 'Pièce client')} className="mt-2 rounded-lg w-full" />
                    </div>
                  )}
                </div>
              </div>

              {/* Second Driver Information */}
              {rental.second_driver_name && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {tr('Informations du second conducteur', 'Informations du second conducteur')}
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{tr('Nom', 'Nom')} :</span>
                      <span className="font-medium">{rental.second_driver_name}</span>
                    </div>
                    {rental.second_driver_license && (
                       <div className="flex justify-between">
                        <span className="text-gray-600">{tr('Permis', 'Permis')} :</span>
                        <span className="font-medium">{rental.second_driver_license}</span>
                      </div>
                    )}
                    {rental.second_driver_id_image && (
                      <div>
                        <span className="text-gray-600">Second Driver ID:</span>
                        <img src={rental.second_driver_id_image} alt="Second Driver ID" className="mt-2 rounded-lg w-full" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Right Column */}
            <div className="space-y-6">
              {/* Vehicle Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Vehicle Information
                </h3>
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : vehicle ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-medium">{vehicle.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Model:</span>
                      <span className="font-medium">
                        {`${vehicle.model || vehicle.name} (${vehicle.plate_number || 'No Plate'})`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Brand:</span>
                      <span className="font-medium">{vehicle.brand}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Year:</span>
                      <span className="font-medium">{vehicle.year}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Plate Number:</span>
                      <span className="font-medium">{vehicle.plate_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className="font-medium">{vehicle.status}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Vehicle not found</p>
                )}
              </div>
              
              {/* Location Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Location Information
                </h3>
                <div className="space-y-3">
                  {rental.pickup_location && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pickup Location:</span>
                      <span className="font-medium">{rental.pickup_location}</span>
                    </div>
                  )}
                  {rental.dropoff_location && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Return Location:</span>
                      <span className="font-medium">{rental.dropoff_location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Notes */}
          {rental.notes && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Notes
              </h3>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                {rental.notes}
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="mt-8 border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Actions
            </h3>
            <div className="flex flex-wrap gap-3">
              {rental.rental_status === 'scheduled' && (
                <button
                  onClick={() => handleStatusUpdate('active')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all"
                  disabled={loading}
                >
                  Start Rental
                </button>
              )}
              {rental.rental_status === 'active' && (
                <button
                  onClick={() => handleStatusUpdate('completed')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                  disabled={loading}
                >
                  Complete Rental
                </button>
              )}
              {['scheduled', 'active'].includes(rental.rental_status) && (
                <button
                  onClick={() => handleStatusUpdate('cancelled')}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                  disabled={loading}
                >
                  Cancel Rental
                </button>
              )}
            </div>
          </div>
          
          {/* Timestamps */}
          <div className="mt-8 border-t pt-6 text-sm text-gray-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-medium">Created At:</span>
                <span className="ml-2">{formatDate(rental.created_at)}</span>
              </div>
              <div>
                <span className="font-medium">Updated At:</span>
                <span className="ml-2">{formatDate(rental.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalDetailsModal;
