import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import VehicleModelService from '../../services/VehicleModelService';
import { resolveTankCapacityLiters } from '../../utils/vehicleModelSpecs';
import i18n from '../../i18n';

const VehicleModelEditModal = ({ vehicleModel, isOpen, onClose, onSave, onError }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'quad',
    description: '',
    power_cc_min: 0,
    power_cc_max: 0,
    capacity_min: 1,
    capacity_max: 1,
    tank_capacity_liters: '',
    features: [],
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (vehicleModel && isOpen) {
      setFormData({
        name: vehicleModel.name || '',
        model: vehicleModel.model || '',
        vehicle_type: vehicleModel.vehicle_type || 'quad',
        description: vehicleModel.description || '',
        power_cc_min: vehicleModel.power_cc_min || 0,
        power_cc_max: vehicleModel.power_cc_max || 0,
        capacity_min: vehicleModel.capacity_min || 1,
        capacity_max: vehicleModel.capacity_max || 1,
        tank_capacity_liters: resolveTankCapacityLiters(vehicleModel.tank_capacity_liters, vehicleModel.model, vehicleModel.name)?.toString() || '',
        features: vehicleModel.features || [],
        is_active: vehicleModel.is_active !== undefined ? vehicleModel.is_active : true
      });
      setError('');
    }
  }, [vehicleModel, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate form data
      const validation = VehicleModelService.validateModel(formData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // Update the vehicle model
      const updatedModel = await VehicleModelService.updateModel(vehicleModel.id, formData);
      
      console.log('✅ Vehicle model updated successfully:', updatedModel);
      
      // Call success callback
      if (onSave) {
        onSave(updatedModel);
      }
      
      // Close modal
      onClose();
      
    } catch (error) {
      console.error('❌ Error updating vehicle model:', error);
      const errorMessage = error.message || 'Failed to update vehicle model';
      setError(errorMessage);
      
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFeatureAdd = (feature) => {
    if (feature.trim() && !formData.features.includes(feature.trim())) {
      setFormData({
        ...formData,
        features: [...formData.features, feature.trim()]
      });
    }
  };

  const handleFeatureRemove = (featureToRemove) => {
    setFormData({
      ...formData,
      features: formData.features.filter(feature => feature !== featureToRemove)
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Modifier le modèle de véhicule</h2>
            <p className="text-sm text-gray-600">Mettez à jour les informations du modèle de véhicule</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm text-red-600 font-medium">Erreur lors de la mise à jour du modèle</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du modèle <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ex. Segway AT6"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Identifiant du modèle <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ex. AT6"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacité du réservoir (L)</label>
            <input
              type="number"
              value={formData.tank_capacity_liters}
              onChange={(e) => setFormData({...formData, tank_capacity_liters: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="1"
              step="0.1"
              placeholder="ex. 19"
            />
            <p className="mt-1 text-xs text-gray-500">Capacité partagée utilisée pour le carburant, les locations et les tours.</p>
          </div>

          {/* Vehicle Type and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule</label>
              <select
                value={formData.vehicle_type}
                onChange={(e) => setFormData({...formData, vehicle_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="quad">Quad</option>
                <option value="ATV">ATV</option>
                <option value="UTV">UTV</option>
                <option value="buggy">Buggy</option>
                <option value="car">Car</option>
                <option value="motorhome">Motorhome</option>
                <option value="jet_ski">Jet Ski</option>
                <option value="electric_bike">Electric Bike</option>
                <option value="electric_motorbike">Electric Motorbike</option>
                <option value="electric_motorcycle">Electric Motorcycle</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="scooter">Scooter</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                value={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.value === 'true'})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </div>
          </div>

          {/* Power Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puissance min. (CC)</label>
              <input
                type="number"
                value={formData.power_cc_min}
                onChange={(e) => setFormData({...formData, power_cc_min: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puissance max. (CC)</label>
              <input
                type="number"
                value={formData.power_cc_max}
                onChange={(e) => setFormData({...formData, power_cc_max: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>
          </div>

          {/* Capacity Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacité min.</label>
              <input
                type="number"
                value={formData.capacity_min}
                onChange={(e) => setFormData({...formData, capacity_min: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacité max.</label>
              <input
                type="number"
                value={formData.capacity_max}
                onChange={(e) => setFormData({...formData, capacity_max: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Description facultative du modèle de véhicule"
            />
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caractéristiques</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.features.map((feature, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded cursor-pointer"
                  onClick={() => handleFeatureRemove(feature)}
                >
                  {feature}
                  <X className="w-3 h-3" />
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Ajouter une caractéristique puis appuyer sur Entrée"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFeatureAdd(e.target.value);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {tr('Updating...', 'Mise à jour...')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {tr('Update Model', 'Mettre à jour le modèle')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleModelEditModal;
