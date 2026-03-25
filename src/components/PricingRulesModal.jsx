import React, { useState, useEffect } from 'react';
import PricingRulesService from '../services/PricingRulesService';
import VehicleModelService from '../services/VehicleModelService';

/**
 * PricingRulesModal - Modal for managing vehicle pricing rules
 * 
 * Allows creating, editing, and deleting pricing rules for different
 * vehicle models and rental types.
 */
const PricingRulesModal = ({ isOpen, onClose, onSuccess }) => {
  const [pricingRules, setPricingRules] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    vehicle_model_id: '',
    rental_type: 'daily',
    hourly_rate: '',
    daily_rate: '',
    weekly_rate: '',
    monthly_rate: '',
    weekly_discount: '',
    monthly_discount: '',
    is_active: true
  });

  /**
   * Fetch pricing rules and vehicle models
   */
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rules, models] = await Promise.all([
        PricingRulesService.getAllPricingRules(),
        VehicleModelService.getActiveModels() // Use centralized service
      ]);
      
      // CRITICAL: Always ensure arrays
      setPricingRules(Array.isArray(rules) ? rules : []);
      setVehicleModels(Array.isArray(models) ? models : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching pricing data:', err);
      setError(err.message);
      // CRITICAL: Set empty arrays on error
      setPricingRules([]);
      setVehicleModels([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initialize data when modal opens
   */
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  /**
   * Handle form input changes
   */
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form data
    const validation = PricingRulesService.validatePricingRule(formData);
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }

    setLoading(true);
    try {
      // Convert string numbers to actual numbers
      const ruleData = {
        ...formData,
        vehicle_model_id: formData.vehicle_model_id, // Store ID, not name
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        daily_rate: parseFloat(formData.daily_rate),
        weekly_rate: formData.weekly_rate ? parseFloat(formData.weekly_rate) : null,
        monthly_rate: formData.monthly_rate ? parseFloat(formData.monthly_rate) : null,
        weekly_discount: formData.weekly_discount ? parseFloat(formData.weekly_discount) : null,
        monthly_discount: formData.monthly_discount ? parseFloat(formData.monthly_discount) : null
      };

      if (editingRule) {
        await PricingRulesService.updatePricingRule(editingRule.id, ruleData);
      } else {
        await PricingRulesService.createPricingRule(ruleData);
      }

      // Refresh data
      await fetchData();
      
      // Reset form
      setFormData({
        vehicle_model_id: '',
        rental_type: 'daily',
        hourly_rate: '',
        daily_rate: '',
        weekly_rate: '',
        monthly_rate: '',
        weekly_discount: '',
        monthly_discount: '',
        is_active: true
      });
      
      setEditingRule(null);
      setShowForm(false);
      setError(null);
      
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error saving pricing rule:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle edit rule
   */
  const handleEditRule = (rule) => {
    setFormData({
      vehicle_model_id: rule.vehicle_model_id || '',
      rental_type: rule.rental_type || 'daily',
      hourly_rate: rule.hourly_rate || '',
      daily_rate: rule.daily_rate || '',
      weekly_rate: rule.weekly_rate || '',
      monthly_rate: rule.monthly_rate || '',
      weekly_discount: rule.weekly_discount || '',
      monthly_discount: rule.monthly_discount || '',
      is_active: rule.is_active !== false
    });
    setEditingRule(rule);
    setShowForm(true);
  };

  /**
   * Handle delete rule
   */
  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this pricing rule?')) {
      return;
    }

    setLoading(true);
    try {
      await PricingRulesService.deletePricingRule(ruleId);
      await fetchData();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error deleting pricing rule:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cancel form editing
   */
  const handleCancelForm = () => {
    setFormData({
      vehicle_model_id: '',
      rental_type: 'daily',
      hourly_rate: '',
      daily_rate: '',
      weekly_rate: '',
      monthly_rate: '',
      weekly_discount: '',
      monthly_discount: '',
      is_active: true
    });
    setEditingRule(null);
    setShowForm(false);
    setError(null);
  };

  /**
   * Get vehicle model display name
   */
  const getVehicleModelName = (modelId) => {
    // CRITICAL: Always ensure vehicleModels is an array
    const safeVehicleModels = Array.isArray(vehicleModels) ? vehicleModels : [];
    const model = safeVehicleModels.find(m => m.id === modelId);
    return model ? VehicleModelService.getDisplayLabel(model) : modelId;
  };

  // CRITICAL: Safe array access helpers
  const safePricingRules = Array.isArray(pricingRules) ? pricingRules : [];
  const safeVehicleModels = Array.isArray(vehicleModels) ? vehicleModels : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pricing Rules Management</h2>
            <p className="text-gray-600 mt-1">Manage vehicle pricing rules and rates</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              {showForm ? (editingRule ? 'Edit Pricing Rule' : 'Add New Pricing Rule') : 'Pricing Rules'}
            </h3>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Add New Rule
              </button>
            )}
          </div>

          {showForm ? (
            /* Form Section */
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vehicle Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vehicle Model *
                  </label>
                  <select
                    name="vehicle_model_id"
                    value={formData.vehicle_model_id}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select vehicle model</option>
                    {safeVehicleModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {VehicleModelService.getDetailedLabel(model)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rental Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rental Type *
                  </label>
                  <select
                    name="rental_type"
                    value={formData.rental_type}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="all">All Types</option>
                  </select>
                </div>

                {/* Hourly Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hourly Rate (MAD)
                  </label>
                  <input
                    type="number"
                    name="hourly_rate"
                    value={formData.hourly_rate}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Daily Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Daily Rate (MAD) *
                  </label>
                  <input
                    type="number"
                    name="daily_rate"
                    value={formData.daily_rate}
                    onChange={handleInputChange}
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Weekly Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weekly Rate (MAD)
                  </label>
                  <input
                    type="number"
                    name="weekly_rate"
                    value={formData.weekly_rate}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Monthly Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Rate (MAD)
                  </label>
                  <input
                    type="number"
                    name="monthly_rate"
                    value={formData.monthly_rate}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Weekly Discount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weekly Discount (%)
                  </label>
                  <input
                    type="number"
                    name="weekly_discount"
                    value={formData.weekly_discount}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Monthly Discount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Discount (%)
                  </label>
                  <input
                    type="number"
                    name="monthly_discount"
                    value={formData.monthly_discount}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="text-sm font-medium text-gray-700">
                  Active (rule will be used for calculations)
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (editingRule ? 'Update Rule' : 'Create Rule')}
                </button>
              </div>
            </form>
          ) : (
            /* Rules List Section */
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-2xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading pricing rules...</p>
                </div>
              ) : safePricingRules.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">💰</div>
                  <p className="text-gray-600 mb-4">No pricing rules found</p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create First Rule
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Vehicle Model
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rental Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Daily Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Weekly Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Monthly Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {safePricingRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {getVehicleModelName(rule.vehicle_model_id)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 capitalize">
                              {rule.rental_type}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {rule.daily_rate ? `${rule.daily_rate} MAD` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {rule.weekly_rate ? `${rule.weekly_rate} MAD` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {rule.monthly_rate ? `${rule.monthly_rate} MAD` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              rule.is_active !== false 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {rule.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditRule(rule)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingRulesModal;