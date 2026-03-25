import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit3, DollarSign, Car } from 'lucide-react';
import pricingService from '../../services/PricingService';
import toast from 'react-hot-toast';

const BasePriceEditor = () => {
  const [basePrices, setBasePrices] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newPrice, setNewPrice] = useState({
    model_id: '',
    vehicle_class: '',
    base_price: '',
    price_currency: 'MAD'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pricesResult, vehiclesResult, modelsResult] = await Promise.all([
        pricingService.getBasePrices(),
        pricingService.getVehicles(),
        pricingService.getVehicleModels()
      ]);

      if (pricesResult.success) {
        setBasePrices(pricesResult.data);
      }
      
      if (vehiclesResult.success) {
        setVehicles(vehiclesResult.data);
      }
      
      if (modelsResult.success) {
        setModels(modelsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (priceData) => {
    setSaving(true);
    try {
      const result = await pricingService.upsertBasePrice(priceData);
      
      if (result.success) {
        toast.success('✅ Saved successfully');
        await loadData(); // Refresh data
        setEditingId(null);
        setNewPrice({
          model_id: '',
          vehicle_class: '',
          base_price: '',
          price_currency: 'MAD'
        });
      } else {
        toast.error(result.error || 'Failed to save base price');
      }
    } catch (error) {
      console.error('Error saving base price:', error);
      toast.error('Failed to save base price');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = () => {
    handleSave(newPrice);
  };

  const handleEdit = (price) => {
    setEditingId(price.id);
  };

  const handleUpdate = (id, updatedData) => {
    const priceToUpdate = basePrices.find(p => p.id === id);
    if (priceToUpdate) {
      handleSave({ ...priceToUpdate, ...updatedData });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
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
            <DollarSign className="h-5 w-5 text-green-600" />
            Base Price Editor
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Pricing is layered: Base → Seasonal → Tiers → Discounts → Transport
          </p>
        </div>
      </div>

      {/* Add New Price Form */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Add New Base Price</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <select
              value={newPrice.model_id}
              onChange={(e) => setNewPrice({ ...newPrice, model_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Model</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Class
            </label>
            <select
              value={newPrice.vehicle_class}
              onChange={(e) => setNewPrice({ ...newPrice, vehicle_class: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Class</option>
              <option value="economy">Economy</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base Price (MAD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newPrice.base_price}
              onChange={(e) => setNewPrice({ ...newPrice, base_price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={handleAddNew}
              disabled={saving || !newPrice.base_price || (!newPrice.model_id && !newPrice.vehicle_class)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Price
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Existing Prices List */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">Current Base Prices</h4>
        
        {basePrices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No base prices configured yet</p>
            <p className="text-sm">Add your first base price above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {basePrices.map((price) => (
              <BasePriceRow
                key={price.id}
                price={price}
                models={models}
                vehicles={vehicles}
                isEditing={editingId === price.id}
                onEdit={() => handleEdit(price)}
                onUpdate={(updatedData) => handleUpdate(price.id, updatedData)}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BasePriceRow = ({ 
  price, 
  models, 
  vehicles, 
  isEditing, 
  onEdit, 
  onUpdate, 
  onCancel, 
  saving 
}) => {
  const [editData, setEditData] = useState({
    model_id: price.model_id || '',
    vehicle_class: price.vehicle_class || '',
    base_price: price.base_price || '',
    price_currency: price.price_currency || 'MAD'
  });

  const handleSave = () => {
    onUpdate(editData);
  };

  const getDisplayName = () => {
    if (price.saharax_0u4w4d_vehicles) {
      return `${price.saharax_0u4w4d_vehicles.brand} ${price.saharax_0u4w4d_vehicles.model}`;
    }
    if (price.vehicle_class) {
      return `${price.vehicle_class.charAt(0).toUpperCase() + price.vehicle_class.slice(1)} Class`;
    }
    return 'Unknown';
  };

  if (isEditing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <select
              value={editData.model_id}
              onChange={(e) => setEditData({ ...editData, model_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Model</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Class
            </label>
            <select
              value={editData.vehicle_class}
              onChange={(e) => setEditData({ ...editData, vehicle_class: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Class</option>
              <option value="economy">Economy</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base Price (MAD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editData.base_price}
              onChange={(e) => setEditData({ ...editData, base_price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex items-end gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Car className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h5 className="font-medium text-gray-900">{getDisplayName()}</h5>
            <p className="text-sm text-gray-600">
              Base price for daily rental
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">
              {price.base_price} {price.price_currency}
            </p>
            <p className="text-sm text-gray-600">per day</p>
          </div>
          
          <button
            onClick={onEdit}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BasePriceEditor;