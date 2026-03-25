import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import VehicleModelService from '../../services/VehicleModelService';

const VehicleModelEditModal = ({ vehicleModel, isOpen, onClose, onSave, onError }) => {
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'quad',
    description: '',
    power_cc_min: 0,
    power_cc_max: 0,
    capacity_min: 1,
    capacity_max: 1,
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
            <h2 className="text-xl font-semibold text-gray-900">Edit Vehicle Model</h2>
            <p className="text-sm text-gray-600">Update vehicle model information</p>
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
              <p className="text-sm text-red-600 font-medium">Error updating model</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Segway AT6"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model Identifier <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., AT6"
                required
              />
            </div>
          </div>

          {/* Vehicle Type and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type</label>
              <select
                value={formData.vehicle_type}
                onChange={(e) => setFormData({...formData, vehicle_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="quad">Quad</option>
                <option value="ATV">ATV</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="scooter">Scooter</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.value === 'true'})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          {/* Power Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Power (CC)</label>
              <input
                type="number"
                value={formData.power_cc_min}
                onChange={(e) => setFormData({...formData, power_cc_min: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Power (CC)</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Capacity</label>
              <input
                type="number"
                value={formData.capacity_min}
                onChange={(e) => setFormData({...formData, capacity_min: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
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
              placeholder="Optional description of the vehicle model"
            />
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Features</label>
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
              placeholder="Add feature and press Enter"
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
              Cancel
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
                  Updating...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Update Model
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