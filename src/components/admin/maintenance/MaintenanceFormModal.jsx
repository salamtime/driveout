import React, { useState, useEffect } from 'react';
import { XIcon, CalendarIcon, UserIcon, WrenchIcon, DollarSignIcon, PackageIcon, PlusIcon, TrashIcon } from 'lucide-react';
import InventoryService from '../../../services/InventoryService';
import MaintenanceService from '../../../services/MaintenanceService';

const MaintenanceFormModal = ({ isOpen, onClose, maintenance, vehicles = [], onSave }) => {
  const [formData, setFormData] = useState({
    vehicle_id: '',
    maintenance_type: '',
    description: '',
    scheduled_date: '',
    technician_name: '',
    labor_cost_mad: '',
    external_cost_mad: '',
    tax_mad: '',
    notes: '',
    status: 'scheduled'
  });
  
  // CRITICAL: Add Parts Used state and functionality
  const [partsUsed, setPartsUsed] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customMaintenanceType, setCustomMaintenanceType] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (maintenance) {
        // CRITICAL FIX: Edit mode - populate form with existing data AND load parts from table
        console.log('📝 EDIT MODE: Loading maintenance record:', maintenance);
        
        // ENHANCED: Better field mapping with fallbacks for different field name variations
        const incomingMaintenanceType = maintenance.maintenance_type || '';
        const isPresetType = [
          'oil_change',
          'tire_rotation',
          'brake_service',
          'engine_service',
          'transmission_service',
          'clutch_service',
          'air_filter_replacement',
          'spark_plug_replacement',
          'belt_replacement',
          'coolant_service',
          'battery_service',
          'inspection',
          'repair',
          'other',
        ].includes(incomingMaintenanceType);

        setFormData({
          vehicle_id: maintenance.vehicle_id || '',
          maintenance_type: isPresetType ? incomingMaintenanceType : 'other',
          description: maintenance.description || maintenance.notes || '',
          scheduled_date: maintenance.scheduled_date?.split('T')[0] || 
                         maintenance.service_date?.split('T')[0] || '',
          technician_name: maintenance.technician_name || '',
          labor_cost_mad: maintenance.labor_cost_mad || 
                         maintenance.labor_rate_mad || '',
          external_cost_mad: maintenance.external_cost_mad || '',
          tax_mad: maintenance.tax_mad || '',
          notes: maintenance.notes || maintenance.description || '',
          status: maintenance.status || 'scheduled'
        });
        setCustomMaintenanceType(isPresetType ? '' : incomingMaintenanceType);
        
        // CRITICAL FIX: Load existing parts from maintenance_parts table
        loadMaintenanceParts(maintenance.id);
      } else {
        // Create mode - reset form
        console.log('➕ CREATE MODE: Resetting form for new maintenance record');
        setFormData({
          vehicle_id: '',
          maintenance_type: '',
          description: '',
          scheduled_date: '',
          technician_name: '',
          labor_cost_mad: '',
          external_cost_mad: '',
          tax_mad: '',
          notes: '',
          status: 'scheduled'
        });
        setCustomMaintenanceType('');
        setPartsUsed([]);
      }
      
      // CRITICAL FIX: Load inventory items directly instead of empty catalog
      loadInventoryItems();
    }
  }, [isOpen, maintenance]);

  // CRITICAL FIX: Load existing parts from maintenance_parts table
  const loadMaintenanceParts = async (maintenanceId) => {
    try {
      console.log('📦 LOADING PARTS FROM TABLE for maintenance:', maintenanceId);
      
      const parts = await MaintenanceService.getMaintenanceParts(maintenanceId);
      
      if (parts && parts.length > 0) {
        console.log(`📦 LOADED ${parts.length} PARTS FROM TABLE:`, parts);
        setPartsUsed(parts);
      } else {
        console.log('📦 NO PARTS FOUND IN TABLE, trying JSON fallback...');
        
        // Fallback: try to load from JSON field if table is empty
        if (maintenance && maintenance.parts_used) {
          try {
            const jsonParts = typeof maintenance.parts_used === 'string' 
              ? JSON.parse(maintenance.parts_used) 
              : maintenance.parts_used;
            
            if (Array.isArray(jsonParts) && jsonParts.length > 0) {
              console.log('📦 LOADED PARTS FROM JSON FALLBACK:', jsonParts);
              setPartsUsed(jsonParts);
            } else {
              setPartsUsed([]);
            }
          } catch (error) {
            console.error('❌ Error parsing JSON parts:', error);
            setPartsUsed([]);
          }
        } else {
          setPartsUsed([]);
        }
      }
    } catch (error) {
      console.error('❌ Error loading maintenance parts:', error);
      setPartsUsed([]);
    }
  };

  // CRITICAL FIX: Load inventory items directly (not from empty catalog)
  const loadInventoryItems = async () => {
    try {
      console.log('📦 CRITICAL FIX: Loading inventory items directly for parts selection...');
      
      // FIXED: Use InventoryService directly instead of empty maintenance catalog
      const items = await InventoryService.getItems({ active: true });
      
      console.log(`✅ CRITICAL FIX: Loaded ${items.length} active inventory items directly`);
      console.log('📦 Available items:', items.map(item => `${item.name} (${item.id}) - Stock: ${item.stock_on_hand || item.stock_on_hand || 0}`));
      
      setInventoryItems(items);
    } catch (error) {
      console.error('❌ Error loading inventory items:', error);
      setInventoryItems([]);
    }
  };

  // CRITICAL: Parts Used management functions
  const addPart = () => {
    console.log('➕ Adding new part to maintenance');
    setPartsUsed(prev => [...prev, { item_id: '', quantity: 1, notes: '' }]);
  };

  const updatePart = (index, field, value) => {
    console.log(`✏️ Updating part ${index}: ${field} = ${value}`);
    
    // CRITICAL FIX: Add stock validation when updating quantity or item
    if (field === 'quantity' || field === 'item_id') {
      const part = partsUsed[index];
      const itemId = field === 'item_id' ? value : part.item_id;
      const quantity = field === 'quantity' ? value : part.quantity;
      
      if (itemId && quantity > 0) {
        const item = getItemDetails(itemId);
        if (item) {
          const availableStock = item.stock_on_hand || item.stock_on_hand || 0;
          if (quantity > availableStock) {
            alert(`Insufficient stock for ${item.name}. Available: ${availableStock} ${item.unit || 'units'}`);
            return; // Don't update if insufficient stock
          }
        }
      }
    }
    
    setPartsUsed(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removePart = (index) => {
    console.log(`🗑️ Removing part ${index}`);
    setPartsUsed(prev => prev.filter((_, i) => i !== index));
  };

  const getItemDetails = (itemId) => {
    const item = inventoryItems.find(item => item.id === parseInt(itemId));
    return item || null;
  };

  const getItemSellPrice = (item) => {
    return parseFloat(item?.price_mad || 0) || parseFloat(item?.cost_mad || 0) || 0;
  };

  // CRITICAL FIX: Calculate parts cost using inventory unit costs
  const calculatePartsCost = () => {
    if (!partsUsed || partsUsed.length === 0) return 0;
    
    return partsUsed.reduce((total, part) => {
      if (!part.item_id || !part.quantity) return total;
      
      const item = getItemDetails(part.item_id);
      if (item) {
        const unitCost = getItemSellPrice(item);
        const partTotal = unitCost * (part.quantity || 0);
        console.log(`💰 Part ${item.name}: ${part.quantity} × ${unitCost} MAD sale price = ${partTotal} MAD`);
        return total + partTotal;
      }
      return total;
    }, 0);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'maintenance_type' && value !== 'other') {
      setCustomMaintenanceType('');
    }
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('💾 Saving maintenance record with parts:', { formData, partsUsed });
      
      // CRITICAL FIX: Validate all parts stock before saving
      for (const part of partsUsed) {
        if (part.item_id && part.quantity > 0) {
          const item = getItemDetails(part.item_id);
          if (item) {
            const availableStock = item.stock_on_hand || item.stock_on_hand || 0;
            if (part.quantity > availableStock) {
              alert(`Cannot save: Insufficient stock for ${item.name}. Available: ${availableStock} ${item.unit || 'units'}, Required: ${part.quantity}`);
              setLoading(false);
              return;
            }
          }
        }
      }
      
      // Calculate total cost including parts
      const partsCost = calculatePartsCost();
      const laborCost = parseFloat(formData.labor_cost_mad || 0);
      const externalCost = parseFloat(formData.external_cost_mad || 0);
      const tax = parseFloat(formData.tax_mad || 0);
      const totalCost = laborCost + externalCost + tax + partsCost;
      
      console.log(`💰 Cost breakdown: Parts=${partsCost}, Labor=${laborCost}, External=${externalCost}, Tax=${tax}, Total=${totalCost}`);
      
      const maintenanceData = {
        ...formData,
        maintenance_type: formData.maintenance_type === 'other'
          ? customMaintenanceType.trim()
          : formData.maintenance_type,
        parts_used: JSON.stringify(partsUsed),
        parts_cost_mad: partsCost,
        total_cost_mad: totalCost
      };
      
      let result;
      if (maintenance) {
        // Update existing maintenance
        result = await MaintenanceService.updateMaintenanceRecord(maintenance.id, maintenanceData);
        console.log('✅ Maintenance updated successfully:', result);
      } else {
        // Create new maintenance
        result = await MaintenanceService.createMaintenanceRecord(maintenanceData);
        console.log('✅ Maintenance created successfully:', result);
      }
      
      if (onSave) {
        onSave(result);
      }
      onClose();
    } catch (error) {
      console.error('❌ Error saving maintenance:', error);
      alert(`Error saving maintenance: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // CRITICAL: Complete maintenance with automatic inventory deduction
  const handleCompleteMaintenance = async () => {
    setLoading(true);
    try {
      console.log('🔧 Completing maintenance with automatic inventory deduction:', partsUsed);
      
      if (partsUsed.length === 0) {
        alert('Please add at least one part to complete maintenance with inventory integration.');
        setLoading(false);
        return;
      }
      
      // Validate parts selection
      const invalidParts = partsUsed.filter(part => !part.item_id || !part.quantity || part.quantity <= 0);
      if (invalidParts.length > 0) {
        alert('Please select inventory items and enter valid quantities for all parts.');
        setLoading(false);
        return;
      }
      
      // Check stock availability
      const stockIssues = [];
      for (const part of partsUsed) {
        const item = getItemDetails(part.item_id);
        if (item) {
          const currentStock = item.stock_on_hand || item.stock_on_hand || 0;
          if (part.quantity > currentStock) {
            stockIssues.push(`${item.name}: Need ${part.quantity}, only ${currentStock} available`);
          }
        }
      }
      
      if (stockIssues.length > 0) {
        alert(`Insufficient stock for the following items:\n\n${stockIssues.join('\n')}\n\nPlease adjust quantities or restock items.`);
        setLoading(false);
        return;
      }
      
      // Calculate total cost
      const partsCost = calculatePartsCost();
      const laborCost = parseFloat(formData.labor_cost_mad || 0);
      const externalCost = parseFloat(formData.external_cost_mad || 0);
      const tax = parseFloat(formData.tax_mad || 0);
      const totalCost = laborCost + externalCost + tax + partsCost;
      
      // Update maintenance record with completed status and costs
      const updatedMaintenanceData = {
        ...formData,
        status: 'completed',
        parts_used: JSON.stringify(partsUsed),
        parts_cost_mad: partsCost,
        total_cost_mad: totalCost,
        completed_date: new Date().toISOString()
      };
      
      // Update maintenance record
      const maintenanceResult = await MaintenanceService.updateMaintenanceRecord(
        maintenance.id, 
        updatedMaintenanceData
      );
      
      // Show success message with details
      const partsSummary = partsUsed.map(part => {
        const item = inventoryItems.find(i => i.id == part.item_id);
        return `${item?.name || 'Unknown'}: ${part.quantity} ${item?.unit || 'units'}`;
      }).join(', ');
      
      alert(`Maintenance completed successfully!\n\nParts consumed: ${partsSummary}\nTotal Price: ${totalCost.toFixed(2)} MAD\n\nInventory has been automatically updated.`);
      
      if (onSave) {
        onSave(maintenanceResult);
      }
      onClose();
    } catch (error) {
      console.error('❌ Error completing maintenance:', error);
      alert(`Error completing maintenance: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const maintenanceTypes = [
    { value: 'oil_change', label: 'Oil Change' },
    { value: 'tire_rotation', label: 'Tire Rotation' },
    { value: 'brake_service', label: 'Brake Service' },
    { value: 'engine_service', label: 'Engine Service' },
    { value: 'transmission_service', label: 'Transmission Service' },
    { value: 'clutch_service', label: 'Clutch Service' },
    { value: 'air_filter_replacement', label: 'Air Filter Replacement' },
    { value: 'spark_plug_replacement', label: 'Spark Plug Replacement' },
    { value: 'belt_replacement', label: 'Belt Replacement' },
    { value: 'coolant_service', label: 'Coolant Service' },
    { value: 'battery_service', label: 'Battery Service' },
    { value: 'inspection', label: 'General Inspection' },
    { value: 'repair', label: 'Repair Work' },
    { value: 'other', label: 'Other' }
  ];

  const partsCost = calculatePartsCost();
  const laborCost = parseFloat(formData.labor_cost_mad || 0);
  const externalCost = parseFloat(formData.external_cost_mad || 0);
  const tax = parseFloat(formData.tax_mad || 0);
  const totalCost = laborCost + externalCost + tax + partsCost;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {maintenance ? 'Edit Maintenance Record' : 'Create Maintenance Record'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle *
                </label>
                <select
                  name="vehicle_id"
                  value={formData.vehicle_id}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Vehicle</option>
                  {vehicles.map(vehicle => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number || vehicle.license_plate} - {vehicle.name || vehicle.model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maintenance Type *
                </label>
                <select
                  name="maintenance_type"
                  value={formData.maintenance_type}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Type</option>
                  {maintenanceTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {formData.maintenance_type === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Maintenance Type *
                  </label>
                  <input
                    type="text"
                    value={customMaintenanceType}
                    onChange={(e) => setCustomMaintenanceType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter a custom maintenance type"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scheduled Date *
                </label>
                <input
                  type="date"
                  name="scheduled_date"
                  value={formData.scheduled_date}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Technician Name
                </label>
                <input
                  type="text"
                  name="technician_name"
                  value={formData.technician_name}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter technician name"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe the maintenance work..."
              />
            </div>

            {/* CRITICAL: Parts Used Section - NOW USES INVENTORY ITEMS DIRECTLY */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <PackageIcon className="h-5 w-5 mr-2" />
                  Parts Used {partsUsed.length > 0 && <span className="ml-2 text-sm text-blue-600">({partsUsed.length} parts)</span>}
                  {inventoryItems.length > 0 && <span className="ml-2 text-xs text-green-600">({inventoryItems.length} items available)</span>}
                </h3>
                <button
                  type="button"
                  onClick={addPart}
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  disabled={inventoryItems.length === 0}
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add Part
                </button>
              </div>

              {inventoryItems.length === 0 && (
                <div className="text-center py-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <PackageIcon className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                  <p className="text-yellow-800 font-medium">Loading inventory items...</p>
                  <p className="text-sm text-yellow-600 mt-1">Please wait while we load available parts</p>
                </div>
              )}

              {partsUsed.length === 0 && inventoryItems.length > 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No parts added yet</p>
                  <p className="text-sm text-gray-500 mt-1">Click "Add Part" to select from {inventoryItems.length} available inventory items</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {partsUsed.map((part, index) => (
                    <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Inventory Item * <span className="text-xs text-gray-500">({inventoryItems.length} available)</span>
                          </label>
                          <select
                            value={part.item_id || ''}
                            onChange={(e) => updatePart(index, 'item_id', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select item</option>
                            {inventoryItems.map(item => {
                              const currentStock = item.stock_on_hand || item.stock_on_hand || 0;
                              const isOutOfStock = currentStock <= 0;
                              return (
                                <option 
                                  key={item.id} 
                                  value={item.id}
                                  disabled={isOutOfStock}
                                >
                                  {item.name} {item.sku ? `(${item.sku})` : ''} - {currentStock} {item.unit || 'units'} available
                                  {isOutOfStock ? ' - OUT OF STOCK' : ''}
                                </option>
                              );
                            })}
                          </select>
                          {part.item_id && (
                            <div className="mt-1 text-xs text-gray-500">
                              {(() => {
                                const item = getItemDetails(part.item_id);
                                if (item) {
                                  const sellPrice = getItemSellPrice(item);
                                  return `${item.category || 'N/A'} • Price: ${sellPrice.toFixed(2)} MAD/${item.unit || 'unit'}`;
                                }
                                return '';
                              })()}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity *
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={part.quantity || ''}
                            onChange={(e) => updatePart(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                          {part.item_id && part.quantity && (
                            <div className="mt-1 text-xs text-blue-600 font-medium">
                              {(() => {
                                const item = getItemDetails(part.item_id);
                                if (item) {
                                  const sellPrice = getItemSellPrice(item);
                                  const totalCost = sellPrice * part.quantity;
                                  return `Line Price: ${totalCost.toFixed(2)} MAD`;
                                }
                                return '';
                              })()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removePart(index)}
                            className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-4 w-4 mx-auto" />
                          </button>
                        </div>

                        <div className="md:col-span-4 mt-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                          </label>
                          <input
                            type="text"
                            value={part.notes || ''}
                            onChange={(e) => updatePart(index, 'notes', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Optional notes about this part usage..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Parts Total */}
              {partsUsed.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-900">Inventory Parts Price:</span>
                    <span className="text-sm font-bold text-blue-900">{partsCost.toFixed(2)} MAD</span>
                  </div>
                </div>
              )}
            </div>

            {/* Cost Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Labor Cost (MAD)
                </label>
                <input
                  type="number"
                  name="labor_cost_mad"
                  value={formData.labor_cost_mad}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  External Cost (MAD)
                </label>
                <input
                  type="number"
                  name="external_cost_mad"
                  value={formData.external_cost_mad}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax (MAD)
                </label>
                <input
                  type="number"
                  name="tax_mad"
                  value={formData.tax_mad}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Total Price Display */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Labor Cost:</span>
                  <span className="font-medium">{laborCost.toFixed(2)} MAD</span>
                </div>
                {partsCost > 0 && (
                  <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Inventory Parts Price:</span>
                  <span className="font-medium">{partsCost.toFixed(2)} MAD</span>
                </div>
                )}
                {externalCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">External Cost:</span>
                    <span className="font-medium">{externalCost.toFixed(2)} MAD</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax:</span>
                    <span className="font-medium">{tax.toFixed(2)} MAD</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-lg font-bold text-blue-900">
                  <span>Total Price:</span>
                  <span>{totalCost.toFixed(2)} MAD</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any additional notes or observations..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={loading}
              >
                {loading ? 'Saving...' : (maintenance ? 'Update Maintenance' : 'Create Maintenance')}
              </button>

              {maintenance && maintenance.status === 'scheduled' && partsUsed.length > 0 && (
                <button
                  type="button"
                  onClick={handleCompleteMaintenance}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  disabled={loading}
                >
                  {loading ? 'Completing...' : 'Complete Maintenance'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceFormModal;
