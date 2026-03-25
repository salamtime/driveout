import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { savePricingRule, selectPricingLoading } from '../../../store/slices/pricingSlice';
import { X } from 'lucide-react';

const PricingRuleEditor = ({ rule, isOpen, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const loading = useSelector(selectPricingLoading);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rule_type: 'base',
    is_active: true,
    priority: 0,
    base_rate: '',
    rate_type: 'daily',
    multiplier: 1.0,
    discount_percentage: '',
    valid_from: '',
    valid_until: '',
    conditions: {}
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (rule) {
      setFormData({
        ...rule,
        base_rate: rule.base_rate || '',
        discount_percentage: rule.discount_percentage || '',
        valid_from: rule.valid_from ? new Date(rule.valid_from).toISOString().slice(0, 16) : '',
        valid_until: rule.valid_until ? new Date(rule.valid_until).toISOString().slice(0, 16) : '',
        conditions: rule.conditions || {}
      });
    } else {
      setFormData({
        name: '',
        description: '',
        rule_type: 'base',
        is_active: true,
        priority: 0,
        base_rate: '',
        rate_type: 'daily',
        multiplier: 1.0,
        discount_percentage: '',
        valid_from: '',
        valid_until: '',
        conditions: {}
      });
    }
  }, [rule]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleConditionChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        [key]: value
      }
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }

    if (formData.rule_type === 'base' && !formData.base_rate) {
      newErrors.base_rate = 'Base rate is required for base pricing rules';
    }

    if (formData.valid_from && formData.valid_until) {
      if (new Date(formData.valid_from) >= new Date(formData.valid_until)) {
        newErrors.valid_until = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData = {
      ...formData,
      base_rate: formData.base_rate ? parseFloat(formData.base_rate) : null,
      multiplier: parseFloat(formData.multiplier),
      discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : null,
      priority: parseInt(formData.priority),
      valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : null,
      valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null
    };

    try {
      await dispatch(savePricingRule(submitData)).unwrap();
      onClose();
    } catch (error) {
      console.error('Error saving pricing rule:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {rule ? 'Edit Pricing Rule' : 'Add New Pricing Rule'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-md font-semibold mb-3">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rule Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`mt-1 block w-full border rounded-md px-3 py-2 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="e.g., Weekend Premium Pricing"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rule Type *
                </label>
                <select
                  name="rule_type"
                  value={formData.rule_type}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="base">Base Pricing</option>
                  <option value="seasonal">Seasonal Adjustment</option>
                  <option value="duration">Duration Discount</option>
                  <option value="vehicle_specific">Vehicle Specific</option>
                  <option value="location_based">Location Based</option>
                  <option value="customer_type">Customer Type</option>
                  <option value="promotional">Promotional</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="2"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Optional description of this pricing rule"
                />
              </div>
            </div>
          </div>

          {/* Pricing Configuration */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-md font-semibold mb-3">Pricing Configuration</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {formData.rule_type === 'base' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Base Rate * ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="base_rate"
                      value={formData.base_rate}
                      onChange={handleInputChange}
                      className={`mt-1 block w-full border rounded-md px-3 py-2 ${errors.base_rate ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="0.00"
                    />
                    {errors.base_rate && <p className="text-red-500 text-xs mt-1">{errors.base_rate}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Rate Type
                    </label>
                    <select
                      name="rate_type"
                      value={formData.rate_type}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </>
              )}

              {(formData.rule_type === 'seasonal' || formData.rule_type === 'vehicle_specific') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    name="multiplier"
                    value={formData.multiplier}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="1.0"
                  />
                  <p className="text-xs text-gray-500 mt-1">1.0 = no change, 1.2 = 20% increase, 0.8 = 20% decrease</p>
                </div>
              )}

              {(formData.rule_type === 'duration' || formData.rule_type === 'promotional') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Discount Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    name="discount_percentage"
                    value={formData.discount_percentage}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="0"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Priority
                </label>
                <input
                  type="number"
                  min="0"
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers have higher priority</p>
              </div>
            </div>
          </div>

          {/* Validity Period */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-md font-semibold mb-3">Validity Period</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Valid From
                </label>
                <input
                  type="datetime-local"
                  name="valid_from"
                  value={formData.valid_from}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Valid Until
                </label>
                <input
                  type="datetime-local"
                  name="valid_until"
                  value={formData.valid_until}
                  onChange={handleInputChange}
                  className={`mt-1 block w-full border rounded-md px-3 py-2 ${errors.valid_until ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.valid_until && <p className="text-red-500 text-xs mt-1">{errors.valid_until}</p>}
              </div>
            </div>
          </div>

          {/* Rule Conditions */}
          {formData.rule_type === 'duration' && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-md font-semibold mb-3">Duration Conditions</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Minimum Duration (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.conditions.min_duration_days || ''}
                    onChange={(e) => handleConditionChange('min_duration_days', parseInt(e.target.value) || '')}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="7"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleInputChange}
              className="mr-2"
            />
            <label className="text-sm font-medium text-gray-700">
              Rule is active
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </div>
              ) : (
                rule ? 'Update Rule' : 'Create Rule'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PricingRuleEditor;