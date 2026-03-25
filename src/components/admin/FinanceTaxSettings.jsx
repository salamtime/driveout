import React, { useState, useEffect } from 'react';
import { Calculator, Save, RefreshCw, Settings, Database, HardDrive, Package2, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { 
  fetchTaxSettings, 
  updateTaxSettings, 
  initializeTaxSettings, 
  validateTaxSettings,
  getDefaultTaxSettings 
} from '../../services/taxSettingsService';
import toast from 'react-hot-toast';

const FinanceTaxSettings = ({ currentUser }) => {
  // State management
  const [taxSettings, setTaxSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('default');
  const [online, setOnline] = useState(navigator.onLine);

  // Form state
  const [formData, setFormData] = useState({
    tax_enabled: false,
    tax_percentage: 10.0,
    apply_to_rentals: true,
    apply_to_tours: true
  });

  const [formErrors, setFormErrors] = useState({});

  // Check if user has permission to edit (Owner/Admin only)
  const canEdit = currentUser && (currentUser.role === 'owner' || currentUser.role === 'admin');

  // Load tax settings on component mount
  useEffect(() => {
    loadTaxSettings();
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load tax settings from service
  const loadTaxSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError, source: dataSource } = await fetchTaxSettings();
      
      if (fetchError) {
        setError(fetchError);
        console.error('Error loading tax settings:', fetchError);
      }

      if (data) {
        setTaxSettings(data);
        setFormData({
          tax_enabled: data.tax_enabled || false,
          tax_percentage: data.tax_percentage || 10.0,
          apply_to_rentals: data.apply_to_rentals !== undefined ? data.apply_to_rentals : true,
          apply_to_tours: data.apply_to_tours !== undefined ? data.apply_to_tours : true
        });
      }

      setSource(dataSource);
    } catch (err) {
      console.error('Exception loading tax settings:', err);
      setError(err);
      // Use default settings on error
      const defaultSettings = getDefaultTaxSettings();
      setTaxSettings(defaultSettings);
      setFormData({
        tax_enabled: defaultSettings.tax_enabled,
        tax_percentage: defaultSettings.tax_percentage,
        apply_to_rentals: defaultSettings.apply_to_rentals,
        apply_to_tours: defaultSettings.apply_to_tours
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  // Validate form data
  const validateForm = () => {
    const errors = {};

    if (typeof formData.tax_percentage !== 'number' || isNaN(formData.tax_percentage)) {
      errors.tax_percentage = 'Must be a valid number';
    } else if (formData.tax_percentage < 0 || formData.tax_percentage > 100) {
      errors.tax_percentage = 'Must be between 0 and 100';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save tax settings
  const handleSaveSettings = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to modify tax settings');
      return;
    }

    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: saveError } = await updateTaxSettings(formData, currentUser?.id);
      
      if (saveError) {
        setError(saveError);
        toast.error(`Failed to save tax settings: ${saveError.message}`);
      } else {
        setTaxSettings(data);
        toast.success('Tax settings saved successfully');
      }
    } catch (err) {
      console.error('Exception saving tax settings:', err);
      setError(err);
      toast.error('Failed to save tax settings');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default values
  const handleResetToDefaults = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to modify tax settings');
      return;
    }

    if (!window.confirm('Are you sure you want to reset all tax settings to default values?')) {
      return;
    }

    const defaultSettings = getDefaultTaxSettings();
    setFormData({
      tax_enabled: defaultSettings.tax_enabled,
      tax_percentage: defaultSettings.tax_percentage,
      apply_to_rentals: defaultSettings.apply_to_rentals,
      apply_to_tours: defaultSettings.apply_to_tours
    });

    toast.success('Settings reset to defaults');
  };

  // Reload settings from the source
  const handleReloadSettings = async () => {
    toast.promise(loadTaxSettings(), {
      loading: 'Reloading tax settings...',
      success: 'Tax settings reloaded',
      error: 'Failed to reload tax settings'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading tax settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Finance & Tax Settings
          </h3>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            {online ? (
              <Wifi className="h-4 w-4 text-green-600 mr-1" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600 mr-1" />
            )}
            <span className={`text-xs font-medium ${online ? 'text-green-600' : 'text-red-600'}`}>
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <button
            onClick={handleReloadSettings}
            className="flex items-center text-xs px-2 py-1 text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reload
          </button>
        </div>
      </div>

      {/* Permission Warning */}
      {!canEdit && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="text-yellow-800">
              Only Owner and Admin users can modify tax settings. You have read-only access.
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-red-800">Error: {error.message}</span>
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-6">
        <div className="space-y-6">
          {/* Tax Enable/Disable */}
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
            <div>
              <h4 className="font-medium text-gray-900">Enable Tax</h4>
              <p className="text-sm text-gray-600">
                Turn on/off tax calculation for bookings and rentals
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.tax_enabled}
                onChange={(e) => handleInputChange('tax_enabled', e.target.checked)}
                disabled={!canEdit}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Tax Percentage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.tax_percentage}
                onChange={(e) => handleInputChange('tax_percentage', parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                  formErrors.tax_percentage ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {formErrors.tax_percentage && (
                <p className="text-sm text-red-600 mt-1">{formErrors.tax_percentage}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Enter a value between 0 and 100
              </p>
            </div>

            {/* Tax Preview */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h5 className="font-medium text-blue-900 mb-2">Tax Preview</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>$100.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({formData.tax_percentage}%):</span>
                  <span>${formData.tax_enabled ? (100 * (formData.tax_percentage / 100)).toFixed(2) : '0.00'}</span>
                </div>
                <div className="border-t pt-1 flex justify-between font-medium">
                  <span>Total:</span>
                  <span>${formData.tax_enabled ? (100 + (100 * (formData.tax_percentage / 100))).toFixed(2) : '100.00'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Apply To Settings */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Apply Tax To</h4>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apply_to_rentals}
                  onChange={(e) => handleInputChange('apply_to_rentals', e.target.checked)}
                  disabled={!canEdit}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm text-gray-700">Rentals</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apply_to_tours}
                  onChange={(e) => handleInputChange('apply_to_tours', e.target.checked)}
                  disabled={!canEdit}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm text-gray-700">Tours</span>
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {canEdit && (
          <div className="flex gap-4 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            
            <button
              onClick={handleResetToDefaults}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              <Settings className="h-4 w-4" />
              Reset to Defaults
            </button>
          </div>
        )}
        
        {/* Data Source Info Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-sm text-gray-500">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center">
              <span className="font-medium mr-2">Data Source:</span>
              {source === 'database' && (
                <span className="text-green-600 flex items-center">
                  <Database className="h-4 w-4 mr-1" /> Database
                </span>
              )}
              {source === 'cache' && (
                <span className="text-amber-600 flex items-center">
                  <HardDrive className="h-4 w-4 mr-1" /> Local Cache
                </span>
              )}
              {source === 'default' && (
                <span className="text-blue-600 flex items-center">
                  <Package2 className="h-4 w-4 mr-1" /> Default Values
                </span>
              )}
            </div>
            <div>
              {!online && source !== 'database' && (
                <div className="text-red-500 text-xs">
                  Warning: Working in offline mode. Changes will be saved locally until connection is restored.
                </div>
              )}
              {online && source !== 'database' && (
                <div className="text-amber-500 text-xs">
                  Warning: Using cached or default settings. Click Reload to try connecting to the database again.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceTaxSettings;