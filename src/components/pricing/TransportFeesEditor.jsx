import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import AppSettingsService from '../../services/AppSettingsService';
import { Truck, Save, DollarSign, MapPin } from 'lucide-react';

/**
 * TransportFeesEditor - Manage global transport fees
 * 
 * Allows admin to set Pick-up and Drop-off fees that will be used
 * in rental forms when transport options are selected.
 */
const TransportFeesEditor = ({ onUpdate }) => {
  const [fees, setFees] = useState({
    pickup_fee: 0,
    dropoff_fee: 0
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load transport fees on component mount
  useEffect(() => {
    loadTransportFees();
  }, []);

  const loadTransportFees = async () => {
    setLoading(true);
    try {
      const transportFees = await AppSettingsService.getTransportFees();
      setFees(transportFees);
      setError(null);
    } catch (err) {
      console.error('Error loading transport fees:', err);
      setError('Failed to load transport fees');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFees(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
    
    // Clear messages when user makes changes
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await AppSettingsService.saveTransportFees(fees);
      setSuccess('Transport fees saved successfully!');
      setError(null);
      
      // Notify parent component of update
      if (onUpdate) {
        onUpdate();
      }
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error saving transport fees:', err);
      setError(err.message || 'Failed to save transport fees');
      setSuccess(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFees({
      pickup_fee: 0,
      dropoff_fee: 0
    });
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin text-2xl mb-2">⏳</div>
            <p className="text-gray-600 ml-3">Loading transport fees...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Transport Fees
        </CardTitle>
        <p className="text-sm text-gray-600">
          Set global transport fees that will be automatically applied when customers select transport options in rentals.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
              <p className="text-green-800 text-sm font-medium">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs">!</span>
              </div>
              <p className="text-red-800 text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Transport Fee Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pick-up Fee */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-green-600" />
              <label className="block text-sm font-medium text-gray-700">
                Pick-up Fee (MAD)
              </label>
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                name="pickup_fee"
                value={fees.pickup_fee}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                disabled={saving}
              />
            </div>
            <p className="text-xs text-gray-500">
              Fee charged when customer selects pick-up transport service
            </p>
          </div>

          {/* Drop-off Fee */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-600" />
              <label className="block text-sm font-medium text-gray-700">
                Drop-off Fee (MAD)
              </label>
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                name="dropoff_fee"
                value={fees.dropoff_fee}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                disabled={saving}
              />
            </div>
            <p className="text-xs text-gray-500">
              Fee charged when customer selects drop-off transport service
            </p>
          </div>
        </div>

        {/* Current Total Preview */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Fee Preview</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Pick-up only:</span>
              <span className="font-medium ml-2">{fees.pickup_fee.toFixed(2)} MAD</span>
            </div>
            <div>
              <span className="text-gray-600">Drop-off only:</span>
              <span className="font-medium ml-2">{fees.dropoff_fee.toFixed(2)} MAD</span>
            </div>
            <div>
              <span className="text-gray-600">Both services:</span>
              <span className="font-bold ml-2 text-blue-600">
                {(fees.pickup_fee + fees.dropoff_fee).toFixed(2)} MAD
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2"
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Transport Fees
              </>
            )}
          </Button>
        </div>

        {/* Usage Information */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-blue-800 mb-2">How it works</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• These fees are automatically applied in rental forms when transport options are selected</li>
            <li>• Pick-up fee is added when "Pick-up transport" checkbox is checked</li>
            <li>• Drop-off fee is added when "Drop-off transport" checkbox is checked</li>
            <li>• Both fees are added if both transport options are selected</li>
            <li>• Total amount is recalculated automatically including these fees</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransportFeesEditor;