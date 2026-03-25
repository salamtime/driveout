import React, { useState, useEffect } from 'react';
import { Save, Truck, MapPin, DollarSign } from 'lucide-react';
import pricingService from '../../services/PricingService';
import toast from 'react-hot-toast';

const TransportFeeEditor = () => {
  const [transportFees, setTransportFees] = useState({
    pickup_fee: '',
    dropoff_fee: '',
    currency: 'MAD'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTransportFees();
  }, []);

  const loadTransportFees = async () => {
    setLoading(true);
    try {
      const result = await pricingService.getTransportFees();
      
      if (result.success && result.data) {
        setTransportFees({
          pickup_fee: result.data.pickup_fee || '',
          dropoff_fee: result.data.dropoff_fee || '',
          currency: result.data.currency || 'MAD'
        });
      }
    } catch (error) {
      console.error('Error loading transport fees:', error);
      toast.error('Failed to load transport fees');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await pricingService.upsertTransportFees(transportFees);
      
      if (result.success) {
        toast.success('✅ Saved successfully');
      } else {
        toast.error(result.error || 'Failed to save transport fees');
      }
    } catch (error) {
      console.error('Error saving transport fees:', error);
      toast.error('Failed to save transport fees');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setTransportFees(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Transport Fee Editor
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure pickup and dropoff fees for vehicle delivery
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Pickup Fee */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <MapPin className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Pickup Fee</h4>
              <p className="text-sm text-gray-600">Fee charged for vehicle pickup/delivery</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={transportFees.pickup_fee}
                  onChange={(e) => handleInputChange('pickup_fee', e.target.value)}
                  className="w-full pl-10 pr-16 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  MAD
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dropoff Fee */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <MapPin className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Dropoff Fee</h4>
              <p className="text-sm text-gray-600">Fee charged for vehicle return/collection</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={transportFees.dropoff_fee}
                  onChange={(e) => handleInputChange('dropoff_fee', e.target.value)}
                  className="w-full pl-10 pr-16 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  MAD
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Fee Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Fee Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700">Pickup Fee:</span>
              <span className="font-medium text-blue-900 ml-2">
                {transportFees.pickup_fee || '0.00'} MAD
              </span>
            </div>
            <div>
              <span className="text-blue-700">Dropoff Fee:</span>
              <span className="font-medium text-blue-900 ml-2">
                {transportFees.dropoff_fee || '0.00'} MAD
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-blue-200">
            <span className="text-blue-700">Total (both services):</span>
            <span className="font-semibold text-blue-900 ml-2">
              {(parseFloat(transportFees.pickup_fee || 0) + parseFloat(transportFees.dropoff_fee || 0)).toFixed(2)} MAD
            </span>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Transport Fees
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransportFeeEditor;