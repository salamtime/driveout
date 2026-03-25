import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import VehicleModelService from '../../../services/VehicleModelService';

const SimplePricingManager = () => {
  const { t } = useTranslation();
  const [vehicleModels, setVehicleModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingModel, setEditingModel] = useState(null);
  const [editForm, setEditForm] = useState({
    hourly_mad: '',
    daily_mad: ''
  });

  useEffect(() => {
    fetchVehicleModels();
  }, []);

  const fetchVehicleModels = async () => {
    try {
      setLoading(true);
      const models = await VehicleModelService.getAllVehicleModels();
      setVehicleModels(models);
    } catch (error) {
      console.error('Error fetching vehicle models:', error);
      toast.error('Failed to load vehicle models');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (model) => {
    setEditingModel(model.id);
    const pricing = model.pricing?.[0] || { hourly_mad: 0, daily_mad: 0 };
    setEditForm({
      hourly_mad: pricing.hourly_mad || '',
      daily_mad: pricing.daily_mad || ''
    });
  };

  const handleSaveEdit = async (modelId) => {
    try {
      await VehicleModelService.updateVehicleModelPricing(modelId, {
        hourly_mad: parseFloat(editForm.hourly_mad) || 0,
        daily_mad: parseFloat(editForm.daily_mad) || 0
      });
      
      toast.success('Pricing updated successfully!');
      setEditingModel(null);
      fetchVehicleModels(); // Refresh the data
    } catch (error) {
      console.error('Error updating pricing:', error);
      toast.error('Failed to update pricing');
    }
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
    setEditForm({ hourly_mad: '', daily_mad: '' });
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount || 0).toFixed(2)} MAD`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading vehicle models...</span>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
          Vehicle Model Pricing Management
        </h3>
        
        {vehicleModels.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No vehicle models found</p>
          </div>
        ) : (
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Power Range
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hourly Rate (MAD)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Daily Rate (MAD)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicles Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vehicleModels.map((model) => {
                  const pricing = model.pricing?.[0] || { hourly_mad: 0, daily_mad: 0 };
                  const isEditing = editingModel === model.id;
                  
                  return (
                    <tr key={model.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {model.name} {model.model}
                          </div>
                          <div className="text-sm text-gray-500">
                            {model.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                          {model.vehicle_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {model.power_cc_min === model.power_cc_max 
                          ? `${model.power_cc_min}cc`
                          : `${model.power_cc_min}-${model.power_cc_max}cc`
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.hourly_mad}
                            onChange={(e) => setEditForm(prev => ({ ...prev, hourly_mad: e.target.value }))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
                            placeholder="0.00"
                          />
                        ) : (
                          formatCurrency(pricing.hourly_mad)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.daily_mad}
                            onChange={(e) => setEditForm(prev => ({ ...prev, daily_mad: e.target.value }))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
                            placeholder="0.00"
                          />
                        ) : (
                          formatCurrency(pricing.daily_mad)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {model.vehicles?.length || 0} vehicles
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSaveEdit(model.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditClick(model)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit Pricing
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimplePricingManager;