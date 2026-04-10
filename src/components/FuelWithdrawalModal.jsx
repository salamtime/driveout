import React, { useState, useEffect } from 'react';
import { X, Car, Gauge, Calendar, User, FileText, Loader } from 'lucide-react';
import fuelService from '../services/FuelService';
import i18n from '../i18n';

const FuelWithdrawalModal = ({ isOpen, onClose, onComplete, tankData }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [formData, setFormData] = useState({
    vehicle_id: '',
    liters_taken: '',
    withdrawal_date: new Date().toISOString().split('T')[0],
    filled_by: '',
    odometer_reading: '',
    notes: ''
  });
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadVehicles();
      // Reset form when modal opens
      setFormData({
        vehicle_id: '',
        liters_taken: '',
        withdrawal_date: new Date().toISOString().split('T')[0],
        filled_by: '',
        odometer_reading: '',
        notes: ''
      });
      setError('');
    }
  }, [isOpen]);

  const loadVehicles = async () => {
    console.log('🚗 MODAL: Starting vehicle load...');
    setVehiclesLoading(true);
    setError('');
    
    try {
      console.log('🔄 MODAL: Calling fuelService.getAvailableVehicles()...');
      const vehicleData = await fuelService.getAvailableVehicles();
      
      console.log('📊 MODAL: Received vehicle data:', vehicleData);
      console.log('📈 MODAL: Vehicle data type:', typeof vehicleData);
      console.log('📈 MODAL: Is array?', Array.isArray(vehicleData));
      console.log('📈 MODAL: Vehicle count:', vehicleData?.length || 0);
      
      if (Array.isArray(vehicleData) && vehicleData.length > 0) {
        console.log('✅ MODAL: Setting vehicles to state:', vehicleData);
        setVehicles(vehicleData);
      } else {
        console.log('⚠️ MODAL: No vehicles received or empty array');
        setVehicles([]);
        if (!vehicleData || vehicleData.length === 0) {
          setError(tr("No vehicles were found in the database. Please add vehicles first.", "Aucun véhicule trouvé dans la base de données. Veuillez d'abord ajouter des véhicules."));
        }
      }
    } catch (err) {
      console.error('❌ MODAL: Error loading vehicles:', err);
      setError(`${tr('Failed to load vehicles:', 'Échec du chargement des véhicules :')} ${err.message}`);
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
      console.log('🏁 MODAL: Vehicle loading completed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      if (!formData.vehicle_id || !formData.liters_taken || !formData.filled_by) {
        throw new Error(tr('Please complete all required fields', 'Veuillez remplir tous les champs obligatoires'));
      }

      // Validate fuel amount
      const litersRequested = parseFloat(formData.liters_taken);
      if (isNaN(litersRequested) || litersRequested <= 0) {
        throw new Error(tr('Please enter a valid fuel quantity', 'Veuillez saisir une quantité de carburant valide'));
      }

      if (tankData && litersRequested > tankData.current_volume) {
        throw new Error(`${tr('Not enough fuel in the tank. Available:', 'Pas assez de carburant dans le réservoir. Disponible :')} ${tankData.current_volume}L`);
      }

      const result = await fuelService.addWithdrawal(formData);
      
      if (result.success) {
        onComplete();
      } else {
        throw new Error(result.error || tr('Failed to save the withdrawal', "Échec de l'enregistrement du retrait"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleChange = (e) => {
    const vehicleId = e.target.value;
    // CRITICAL: Safe array access
    const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    const selectedVehicle = safeVehicles.find(v => v.id.toString() === vehicleId);
    
    console.log('🔄 MODAL: Vehicle selection changed:', {
      vehicleId,
      selectedVehicle,
      totalVehicles: safeVehicles.length
    });
    
    setFormData({
      ...formData,
      vehicle_id: vehicleId,
      odometer_reading: selectedVehicle?.current_odometer?.toString() || ''
    });
  };

  const getVehicleDisplayName = (vehicle) => {
    const displayName = `${vehicle.name} (${vehicle.plate_number}) - ${vehicle.status}`;
    console.log('🏷️ MODAL: Vehicle display name:', displayName);
    return displayName;
  };

  const getVehicleStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'text-green-600';
      case 'maintenance':
        return 'text-yellow-600';
      case 'out_of_service':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  // CRITICAL: Safe array access helpers
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  console.log('🔍 MODAL: Render - safeVehicles count:', safeVehicles.length);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Car className="w-5 h-5 text-blue-600" />
              {tr('Vehicle Fuel Withdrawal', 'Retrait de carburant véhicule')}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Vehicle Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Select a vehicle', 'Sélectionner un véhicule')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.vehicle_id}
                  onChange={handleVehicleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={vehiclesLoading}
                >
                  <option value="">
                    {vehiclesLoading ? tr('Loading available vehicles...', 'Chargement des véhicules disponibles...') : tr('Choose a vehicle...', 'Choisissez un véhicule...')}
                  </option>
                  {!vehiclesLoading && safeVehicles.length === 0 && (
                    <option value="" disabled>{tr('No vehicles available', 'Aucun véhicule disponible')}</option>
                  )}
                  {!vehiclesLoading && safeVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {getVehicleDisplayName(vehicle)}
                    </option>
                  ))}
                </select>
                {vehiclesLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              {formData.vehicle_id && (
                <div className="mt-2 text-sm text-gray-600">
                  {(() => {
                    const selectedVehicle = safeVehicles.find(v => v.id.toString() === formData.vehicle_id);
                    return selectedVehicle ? (
                      <div className="flex items-center gap-4">
                        <span>{tr('Model', 'Modèle')} : {selectedVehicle.model}</span>
                        <span className={getVehicleStatusColor(selectedVehicle.status)}>
                          {tr('Status', 'Statut')} : {selectedVehicle.status.replace('_', ' ')}
                        </span>
                        {selectedVehicle.current_odometer && (
                          <span>{tr('Odometer', 'Compteur')} : {selectedVehicle.current_odometer}km</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            {/* Fuel Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Fuel quantity (liters)', 'Quantité de carburant (litres)')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={tankData?.current_volume || 1000}
                  value={formData.liters_taken}
                  onChange={(e) => setFormData({...formData, liters_taken: e.target.value})}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.0"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">L</span>
              </div>
              {tankData && (
                <p className="text-xs text-gray-500 mt-1">
                  {tr('Available in tank', 'Disponible dans le réservoir')} : {tankData.current_volume}L
                </p>
              )}
            </div>

            {/* Withdrawal Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Withdrawal date', 'Date du retrait')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.withdrawal_date}
                  onChange={(e) => setFormData({...formData, withdrawal_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
            </div>

            {/* Filled By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Filled by', 'Rempli par')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.filled_by}
                  onChange={(e) => setFormData({...formData, filled_by: e.target.value})}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={tr("Enter the operator's name", "Entrez le nom de l'opérateur")}
                  required
                />
                <User className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
            </div>

            {/* Odometer Reading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Odometer reading (km)', 'Relevé du compteur (km)')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={formData.odometer_reading}
                  onChange={(e) => setFormData({...formData, odometer_reading: e.target.value})}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={tr('Current odometer reading', 'Relevé actuel du compteur')}
                />
                <Gauge className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {tr('Notes', 'Notes')}
            </label>
            <div className="relative">
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={tr('Additional notes or comments...', 'Notes ou commentaires supplémentaires...')}
              />
              <FileText className="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>
          </div>

          {/* Tank Status Info */}
          {tankData && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2">{tr('Current tank status', 'État actuel du réservoir')}</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">{tr('Available fuel', 'Carburant disponible')} :</span>
                  <span className="ml-2 font-medium text-blue-800">{tankData.current_volume}L</span>
                </div>
                <div>
                  <span className="text-blue-600">{tr('Tank capacity', 'Capacité du réservoir')} :</span>
                  <span className="ml-2 font-medium text-blue-800">{tankData.capacity}L</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={loading}
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              type="submit"
              disabled={loading || vehiclesLoading || !formData.vehicle_id}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {tr('Saving...', 'Enregistrement...')}
                </>
              ) : (
                <>
                  <Car className="w-4 h-4" />
                  {tr('Save withdrawal', 'Enregistrer le retrait')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FuelWithdrawalModal;
