import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import { supabase } from '../../lib/supabase';
import { 
  X, 
  Save, 
  Calculator, 
  Car, 
  Wrench, 
  Calendar, 
  DollarSign,
  Clock,
  FileText
} from 'lucide-react';

/**
 * AddMaintenanceForm - Mobile-friendly form for adding maintenance records
 * 
 * Features auto-prefill from pricing catalog and comprehensive cost tracking
 */
const AddMaintenanceForm = ({ onCancel, onSuccess, editingRecord = null }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // CRITICAL: Always initialize as arrays
  const [vehicles, setVehicles] = useState([]);
  const [pricingCatalog, setPricingCatalog] = useState([]);
  
  const [formData, setFormData] = useState({
    vehicle_id: '',
    maintenance_type: 'Oil',
    status: 'scheduled',
    scheduled_date: new Date().toISOString().split('T')[0],
    completed_date: '',
    odometer_reading: '',
    labor_hours: '',
    labor_rate_mad: '',
    parts_cost_mad: '',
    external_cost_mad: '',
    tax_mad: '',
    notes: '',
    technician_name: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    // Auto-prefill from pricing catalog when maintenance type changes
    if (formData.maintenance_type && pricingCatalog.length > 0) {
      const pricing = pricingCatalog.find(p => p.maintenance_type === formData.maintenance_type);
      if (pricing && !editingRecord) {
        setFormData(prev => ({
          ...prev,
          labor_hours: pricing.default_labor_hours?.toString() || '',
          labor_rate_mad: pricing.default_labor_rate_mad?.toString() || '',
          parts_cost_mad: pricing.default_parts_cost_mad?.toString() || ''
        }));
      }
    }
  }, [formData.maintenance_type, pricingCatalog, editingRecord]);

  useEffect(() => {
    // Load editing record data
    if (editingRecord) {
      setFormData({
        vehicle_id: editingRecord.vehicle_id?.toString() || '',
        maintenance_type: editingRecord.maintenance_type || 'Oil',
        status: editingRecord.status || 'scheduled',
        scheduled_date: editingRecord.scheduled_date || new Date().toISOString().split('T')[0],
        completed_date: editingRecord.completed_date || '',
        odometer_reading: editingRecord.odometer_reading?.toString() || '',
        labor_hours: editingRecord.labor_hours?.toString() || '',
        labor_rate_mad: editingRecord.labor_rate_mad?.toString() || '',
        parts_cost_mad: editingRecord.parts_cost_mad?.toString() || '',
        external_cost_mad: editingRecord.external_cost_mad?.toString() || '',
        tax_mad: editingRecord.tax_mad?.toString() || '',
        notes: editingRecord.notes || '',
        technician_name: editingRecord.technician_name || ''
      });
    }
  }, [editingRecord]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Load vehicles and pricing catalog
      const [vehiclesData, pricingData] = await Promise.all([
        supabase.from('saharax_0u4w4d_vehicles').select('id, name, model, plate_number, current_odometer').order('name'),
        MaintenanceTrackingService.getMaintenancePricingCatalog()
      ]);

      if (vehiclesData.error) throw vehiclesData.error;
      
      // CRITICAL: Always ensure arrays
      const safeVehicles = Array.isArray(vehiclesData.data) ? vehiclesData.data : [];
      const safePricing = Array.isArray(pricingData) ? pricingData : [];
      
      setVehicles(safeVehicles);
      setPricingCatalog(safePricing);
      
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError(`Failed to load data: ${err.message}`);
      // CRITICAL: Set empty arrays on error
      setVehicles([]);
      setPricingCatalog([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calculateTotalCost = () => {
    const laborHours = parseFloat(formData.labor_hours) || 0;
    const laborRate = parseFloat(formData.labor_rate_mad) || 0;
    const partsCost = parseFloat(formData.parts_cost_mad) || 0;
    const externalCost = parseFloat(formData.external_cost_mad) || 0;
    const tax = parseFloat(formData.tax_mad) || 0;
    
    const laborCost = laborHours * laborRate;
    const totalCost = laborCost + partsCost + externalCost + tax;
    
    return {
      laborCost,
      totalCost
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Validate required fields
      if (!formData.vehicle_id) {
        throw new Error('Please select a vehicle');
      }

      if (!formData.maintenance_type) {
        throw new Error('Please select a maintenance type');
      }

      if (!formData.scheduled_date) {
        throw new Error('Please enter a scheduled date');
      }

      // CRITICAL FIX: Convert vehicle_id to integer BEFORE sending to service
      const vehicleIdAsInteger = parseInt(formData.vehicle_id);
      if (!vehicleIdAsInteger || isNaN(vehicleIdAsInteger)) {
        throw new Error('Invalid vehicle selection');
      }

      const maintenanceData = {
        vehicle_id: vehicleIdAsInteger, // FIXED: Send as integer, not string
        maintenance_type: formData.maintenance_type,
        status: formData.status,
        scheduled_date: formData.scheduled_date,
        completed_date: formData.status === 'completed' ? (formData.completed_date || formData.scheduled_date) : null,
        odometer_reading: formData.odometer_reading ? parseInt(formData.odometer_reading) : null,
        labor_hours: parseFloat(formData.labor_hours) || 0,
        labor_rate_mad: parseFloat(formData.labor_rate_mad) || 0,
        parts_cost_mad: parseFloat(formData.parts_cost_mad) || 0,
        external_cost_mad: parseFloat(formData.external_cost_mad) || 0,
        tax_mad: parseFloat(formData.tax_mad) || 0,
        notes: formData.notes.trim(),
        technician_name: formData.technician_name.trim(),
        created_by: 'Admin' // TODO: Get from auth context
      };

      console.log('🔍 Form submitting vehicle_id:', vehicleIdAsInteger, typeof vehicleIdAsInteger);
      console.log('📝 Complete maintenance data:', maintenanceData);

      if (editingRecord) {
        await MaintenanceTrackingService.updateMaintenanceRecord(editingRecord.id, maintenanceData);
      } else {
        await MaintenanceTrackingService.createMaintenanceRecord(maintenanceData);
      }

      onSuccess();
      
    } catch (err) {
      console.error('Error saving maintenance record:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const { laborCost, totalCost } = calculateTotalCost();

  // CRITICAL: Safe array access
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const safeMaintenanceTypes = Array.isArray(MaintenanceTrackingService.MAINTENANCE_TYPES) ? MaintenanceTrackingService.MAINTENANCE_TYPES : ['Oil', 'Filter', 'Brake', 'Tire', 'Engine', 'Transmission', 'Electrical', 'Body', 'Other'];

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            {editingRecord ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle and Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Car className="w-4 h-4 inline mr-1" />
                Vehicle *
              </label>
              <select
                name="vehicle_id"
                value={formData.vehicle_id}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loading}
              >
                <option value="">Select a vehicle...</option>
                {safeVehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.plate_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Wrench className="w-4 h-4 inline mr-1" />
                Maintenance Type *
              </label>
              <select
                name="maintenance_type"
                value={formData.maintenance_type}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loading}
              >
                {safeMaintenanceTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status and Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status *
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loading}
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Scheduled Date *
              </label>
              <input
                type="date"
                name="scheduled_date"
                value={formData.scheduled_date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loading}
              />
            </div>

            {formData.status === 'completed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Completed Date
                </label>
                <input
                  type="date"
                  name="completed_date"
                  value={formData.completed_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Odometer and Technician */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Odometer Reading (km)
              </label>
              <input
                type="number"
                name="odometer_reading"
                value={formData.odometer_reading}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
                disabled={loading}
                placeholder="Current odometer reading"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
                placeholder="Name of technician"
              />
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-blue-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Cost Breakdown (MAD)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Labor Hours
                </label>
                <input
                  type="number"
                  name="labor_hours"
                  value={formData.labor_hours}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.25"
                  disabled={loading}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Labor Rate (MAD/hour)
                </label>
                <input
                  type="number"
                  name="labor_rate_mad"
                  value={formData.labor_rate_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parts Cost (MAD)
                </label>
                <input
                  type="number"
                  name="parts_cost_mad"
                  value={formData.parts_cost_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Cost Summary */}
            <div className="bg-white rounded-lg p-3 border">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Labor Cost:</span>
                <span className="font-medium">{MaintenanceTrackingService.formatCurrency(laborCost)}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold text-blue-900 pt-2 border-t">
                <span>Total Cost:</span>
                <span>{MaintenanceTrackingService.formatCurrency(totalCost)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={loading}
              placeholder="Additional notes about the maintenance work..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 flex-1"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {editingRecord ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {editingRecord ? 'Update Maintenance' : 'Create Maintenance'}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddMaintenanceForm;