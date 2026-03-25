import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { Edit, Trash2, Plus, Save, X, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
// CRITICAL FIX: Import default export instead of named export
import VehicleModelService from '../../services/VehicleModelService';

// Add Model Modal Component - Memoized to prevent re-renders
const AddModelModal = React.memo(({ isOpen, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'quad',
    hourly_mad: '',
    daily_mad: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name.trim()) {
        throw new Error('Model name is required');
      }
      if (!formData.model.trim()) {
        throw new Error('Model identifier is required');
      }

      const modelData = {
        name: formData.name.trim(),
        model: formData.model.trim(),
        vehicle_type: formData.vehicle_type,
        hourly_mad: parseFloat(formData.hourly_mad) || 0,
        daily_mad: parseFloat(formData.daily_mad) || 0
      };

      await onSubmit(modelData);
      
      setFormData({
        name: '',
        model: '',
        vehicle_type: 'quad',
        hourly_mad: '',
        daily_mad: ''
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [formData, onSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('admin.rentals.addModel', 'Add New Vehicle Model')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., SEGWAY AT6"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Identifier *
            </label>
            <input
              type="text"
              name="model"
              value={formData.model}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., AT6"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Type
            </label>
            <select
              name="vehicle_type"
              value={formData.vehicle_type}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            >
              <option value="quad">Quad</option>
              <option value="ATV">ATV</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="scooter">Scooter</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate (MAD)
              </label>
              <input
                type="number"
                name="hourly_mad"
                value={formData.hourly_mad}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
                min="0"
                step="0.01"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Rate (MAD)
              </label>
              <input
                type="number"
                name="daily_mad"
                value={formData.daily_mad}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
                min="0"
                step="0.01"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Model
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

AddModelModal.displayName = 'AddModelModal';

const PricingRulesManager = React.memo(() => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { vehicles } = useSelector(state => state.vehicles);
  
  const [vehicleModels, setVehicleModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingModel, setEditingModel] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingModel, setDeletingModel] = useState(null);
  const [editForm, setEditForm] = useState({
    hourly_mad: '',
    daily_mad: ''
  });

  // CRITICAL FIX: Use single ref to track loading state
  const loadingStateRef = useRef({
    isLoading: false,
    hasLoaded: false,
    mountCount: 0
  });

  // CRITICAL FIX: Stable load function that prevents infinite loops
  const loadData = useCallback(async () => {
    // Increment mount counter for debugging
    loadingStateRef.current.mountCount++;
    console.log(`🔄 PricingRulesManager: Load attempt #${loadingStateRef.current.mountCount}`);

    // CRITICAL: Prevent multiple simultaneous loads
    if (loadingStateRef.current.isLoading) {
      console.log('🛑 Already loading, skipping...');
      return;
    }

    // CRITICAL: Don't reload if we already have data
    if (loadingStateRef.current.hasLoaded && vehicleModels.length > 0) {
      console.log('🛑 Data already loaded, skipping...');
      return;
    }

    console.log('🚀 Starting data load...');
    loadingStateRef.current.isLoading = true;
    setLoading(true);
    setError(null);

    try {
      // Load vehicles (non-blocking)
      dispatch(fetchVehicles()).catch(err => {
        console.warn('⚠️ Vehicles load failed (non-critical):', err);
      });
      
      // Load vehicle models
      console.log('📋 Loading vehicle models...');
      const models = await VehicleModelService.getAllVehicleModels();
      
      console.log('✅ Received models:', models?.length || 0);
      
      // CRITICAL: Update state immediately
      if (Array.isArray(models)) {
        setVehicleModels(models);
        loadingStateRef.current.hasLoaded = true;
        console.log(`✅ Successfully set ${models.length} models in state`);
      } else {
        console.warn('⚠️ Models is not an array:', models);
        setVehicleModels([]);
        loadingStateRef.current.hasLoaded = true;
      }
      
    } catch (err) {
      console.error('❌ Load error:', err);
      setError(err.message || 'Failed to load pricing data');
      loadingStateRef.current.hasLoaded = false;
      
    } finally {
      loadingStateRef.current.isLoading = false;
      setLoading(false);
      console.log('✅ Load completed');
    }
  }, [dispatch, vehicleModels.length]);

  // CRITICAL FIX: Load only once on mount
  useEffect(() => {
    console.log('🔄 Component mounted, mount count:', loadingStateRef.current.mountCount);
    
    // Only load if we haven't loaded yet
    if (!loadingStateRef.current.hasLoaded && !loadingStateRef.current.isLoading) {
      loadData();
    }

    // Cleanup function
    return () => {
      loadingStateRef.current.isLoading = false;
    };
  }, []); // CRITICAL: Empty dependency array

  // Memoized handlers to prevent re-renders
  const handleEdit = useCallback((model) => {
    console.log('✏️ Editing model:', model.id);
    setEditingModel(model.id);
    setEditForm({
      hourly_mad: model.pricing?.[0]?.hourly_mad || '',
      daily_mad: model.pricing?.[0]?.daily_mad || ''
    });
  }, []);

  const handleSave = useCallback(async (modelId) => {
    console.log('💾 Saving model:', modelId);
    try {
      await VehicleModelService.updateVehicleModelPricing(modelId, {
        hourly_mad: parseFloat(editForm.hourly_mad) || 0,
        daily_mad: parseFloat(editForm.daily_mad) || 0,
        vehicle_type: 'quad'
      });
      
      setEditingModel(null);
      setEditForm({ hourly_mad: '', daily_mad: '' });
      
      // Force reload
      loadingStateRef.current.hasLoaded = false;
      await loadData();
    } catch (err) {
      console.error('❌ Save error:', err);
      setError(err.message);
    }
  }, [editForm, loadData]);

  const handleCancel = useCallback(() => {
    setEditingModel(null);
    setEditForm({ hourly_mad: '', daily_mad: '' });
  }, []);

  // FIXED: Enhanced delete functionality with proper error handling
  const handleDeleteModel = useCallback(async (model) => {
    const activeVehicles = model.vehicles?.length || 0;
    
    let confirmMessage = `Are you sure you want to delete the vehicle model "${model.name} ${model.model}"?`;
    
    if (activeVehicles > 0) {
      confirmMessage += `\n\nWarning: This model has ${activeVehicles} active vehicle(s) associated with it.`;
    }
    
    confirmMessage += '\n\nThis action cannot be undone.';

    if (window.confirm(confirmMessage)) {
      setDeletingModel(model.id);
      try {
        await VehicleModelService.deleteVehicleModel(model.id);
        alert(`Vehicle model "${model.name} ${model.model}" has been deleted successfully.`);
        
        // Force reload
        loadingStateRef.current.hasLoaded = false;
        await loadData();
      } catch (err) {
        console.error('❌ Delete error:', err);
        alert(`Error: ${err.message}`);
        setError(err.message);
      } finally {
        setDeletingModel(null);
      }
    }
  }, [loadData]);

  // FIXED: New function to delete only pricing rules (not the model)
  const handleDeletePricingRule = useCallback(async (model) => {
    if (window.confirm(`Are you sure you want to delete the pricing rule for "${model.name} ${model.model}"?\n\nThis will only remove the pricing data, not the vehicle model itself.`)) {
      setDeletingModel(model.id);
      try {
        await VehicleModelService.deletePricingRule(model.id);
        alert(`Pricing rule for "${model.name} ${model.model}" has been deleted successfully.`);
        
        // Force reload
        loadingStateRef.current.hasLoaded = false;
        await loadData();
      } catch (err) {
        console.error('❌ Delete pricing rule error:', err);
        alert(`Error: ${err.message}`);
        setError(err.message);
      } finally {
        setDeletingModel(null);
      }
    }
  }, [loadData]);

  const handleAddModel = useCallback(async (modelData) => {
    console.log('➕ Adding model:', modelData);
    try {
      await VehicleModelService.createVehicleModelWithPricing(modelData);
      
      // Force reload
      loadingStateRef.current.hasLoaded = false;
      await loadData();
      
      alert('Vehicle model added successfully!');
    } catch (err) {
      console.error('❌ Add error:', err);
      throw new Error(err.message || 'Failed to create vehicle model');
    }
  }, [loadData]);

  const handleRetry = useCallback(() => {
    console.log('🔄 Manual retry');
    loadingStateRef.current.hasLoaded = false;
    loadingStateRef.current.isLoading = false;
    setError(null);
    loadData();
  }, [loadData]);

  // Memoized table data to prevent unnecessary re-renders
  const tableData = useMemo(() => {
    return vehicleModels.map((model) => ({
      ...model,
      key: model.id
    }));
  }, [vehicleModels]);

  console.log('🎨 Rendering - loading:', loading, 'error:', !!error, 'models:', vehicleModels.length, 'hasLoaded:', loadingStateRef.current.hasLoaded);

  if (loading && !loadingStateRef.current.hasLoaded) {
    return (
      <div className="flex flex-col justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <span className="text-gray-600">Loading pricing data...</span>
      </div>
    );
  }

  if (error && !loadingStateRef.current.hasLoaded) {
    return (
      <div className="p-6 text-center">
        <div className="flex justify-center mb-4">
          <AlertCircle className="h-12 w-12 text-red-500" />
        </div>
        <div className="text-red-600 mb-2 font-medium">Error loading pricing data</div>
        <div className="text-sm text-gray-600 mb-6 max-w-md mx-auto">{error}</div>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          {t('admin.rentals.vehicleModelPricing', 'Vehicle Model Pricing Management')}
        </h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {t('admin.rentals.addModel', 'Add Model')}
        </button>
      </div>

      {/* Success indicator */}
      {vehicleModels.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3">
          <p className="text-sm text-green-700">
            ✅ Successfully loaded {vehicleModels.length} vehicle models
          </p>
        </div>
      )}

      {/* Table View */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.rentals.model', 'Model')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.rentals.type', 'Type')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.rentals.hourlyRate', 'Hourly Rate (MAD)')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.rentals.dailyRate', 'Daily Rate (MAD)')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.rentals.activeVehicles', 'Active Vehicles')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    {t('admin.rentals.noModels', 'No vehicle models found')}
                  </td>
                </tr>
              ) : (
                tableData.map((model) => (
                  <tr key={model.key} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {model.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {model.model}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {model.vehicle_type || 'quad'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {editingModel === model.id ? (
                        <input
                          type="number"
                          value={editForm.hourly_mad}
                          onChange={(e) => setEditForm(prev => ({ ...prev, hourly_mad: e.target.value }))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0"
                          min="0"
                          step="0.01"
                        />
                      ) : (
                        <div className="text-sm text-gray-900">
                          {model.pricing?.[0]?.hourly_mad ? `${model.pricing[0].hourly_mad} MAD` : 'Not set'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {editingModel === model.id ? (
                        <input
                          type="number"
                          value={editForm.daily_mad}
                          onChange={(e) => setEditForm(prev => ({ ...prev, daily_mad: e.target.value }))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0"
                          min="0"
                          step="0.01"
                        />
                      ) : (
                        <div className="text-sm text-gray-900">
                          {model.pricing?.[0]?.daily_mad ? `${model.pricing[0].daily_mad} MAD` : 'Not set'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {model.vehicles?.length || 0}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingModel === model.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSave(model.id)}
                            className="text-green-600 hover:text-green-900 p-1"
                            title={t('common.save', 'Save')}
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-600 hover:text-gray-900 p-1"
                            title={t('common.cancel', 'Cancel')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(model)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title={t('common.edit', 'Edit')}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {/* FIXED: Two delete options - pricing rule only or entire model */}
                          {model.pricing && model.pricing.length > 0 && (
                            <button
                              onClick={() => handleDeletePricingRule(model)}
                              className={`p-1 transition-colors ${ 
                                deletingModel === model.id 
                                  ? 'text-gray-400 cursor-not-allowed' 
                                  : 'text-orange-600 hover:text-orange-900'
                              }`}
                              title={deletingModel === model.id ? 'Deleting...' : 'Delete Pricing Rule'}
                              disabled={deletingModel === model.id}
                            >
                              {deletingModel === model.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                              ) : (
                                <span className="text-xs">💰</span>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteModel(model)}
                            className={`p-1 transition-colors ${
                              deletingModel === model.id 
                                ? 'text-gray-400 cursor-not-allowed' 
                                : 'text-red-600 hover:text-red-900'
                            }`}
                            title={deletingModel === model.id ? 'Deleting...' : t('common.delete', 'Delete Model')}
                            disabled={deletingModel === model.id}
                          >
                            {deletingModel === model.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Model Modal */}
      <AddModelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddModel}
      />
    </div>
  );
});

PricingRulesManager.displayName = 'PricingRulesManager';

export default PricingRulesManager;