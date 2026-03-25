import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import { 
  DollarSign, 
  Edit, 
  Save, 
  X, 
  Clock, 
  Wrench, 
  RefreshCw,
  Calculator,
  Settings
} from 'lucide-react';

/**
 * MaintenancePricingCatalog - Manage default pricing for maintenance types
 * 
 * Finance-ready pricing management with cost estimation capabilities
 */
const MaintenancePricingCatalog = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [editingType, setEditingType] = useState(null);
  const [editFormData, setEditFormData] = useState({
    default_labor_hours: '',
    default_labor_rate_mad: '',
    default_parts_cost_mad: '',
    description: ''
  });

  useEffect(() => {
    loadPricingCatalog();
  }, []);

  const loadPricingCatalog = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const catalog = await MaintenanceTrackingService.getMaintenancePricingCatalog();
      // CRITICAL: Always ensure array
      const safeCatalog = Array.isArray(catalog) ? catalog : [];
      setPricingCatalog(safeCatalog);
      
    } catch (err) {
      console.error('Error loading pricing catalog:', err);
      setError(`Failed to load pricing catalog: ${err.message}`);
      // CRITICAL: Set empty array on error
      setPricingCatalog([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (pricing) => {
    setEditingType(pricing.maintenance_type);
    setEditFormData({
      default_labor_hours: pricing.default_labor_hours?.toString() || '',
      default_labor_rate_mad: pricing.default_labor_rate_mad?.toString() || '',
      default_parts_cost_mad: pricing.default_parts_cost_mad?.toString() || '',
      description: pricing.description || ''
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const pricingData = {
        default_labor_hours: parseFloat(editFormData.default_labor_hours) || 0,
        default_labor_rate_mad: parseFloat(editFormData.default_labor_rate_mad) || 0,
        default_parts_cost_mad: parseFloat(editFormData.default_parts_cost_mad) || 0,
        description: editFormData.description.trim(),
        is_active: true
      };

      await MaintenanceTrackingService.updateMaintenancePricing(editingType, pricingData);
      
      setSuccess('✅ Pricing updated successfully!');
      setEditingType(null);
      setEditFormData({
        default_labor_hours: '',
        default_labor_rate_mad: '',
        default_parts_cost_mad: '',
        description: ''
      });
      
      await loadPricingCatalog();
      
      // Clear success message after delay
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      console.error('Error updating pricing:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingType(null);
    setEditFormData({
      default_labor_hours: '',
      default_labor_rate_mad: '',
      default_parts_cost_mad: '',
      description: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calculateEstimatedCost = (pricing) => {
    const laborHours = pricing.default_labor_hours || 0;
    const laborRate = pricing.default_labor_rate_mad || 0;
    const partsCost = pricing.default_parts_cost_mad || 0;
    
    const laborCost = laborHours * laborRate;
    const totalCost = laborCost + partsCost;
    
    return {
      laborCost,
      totalCost
    };
  };

  // CRITICAL: Safe array access
  const safePricingCatalog = Array.isArray(pricingCatalog) ? pricingCatalog : [];

  if (loading && safePricingCatalog.length === 0) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Maintenance Pricing Catalog</h2>
          <p className="text-sm text-gray-600">
            Manage default pricing for different maintenance types. These values are used to prefill maintenance forms.
          </p>
        </div>
        <Button
          onClick={loadPricingCatalog}
          variant="outline"
          size="sm"
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {safePricingCatalog.map((pricing) => {
          const { laborCost, totalCost } = calculateEstimatedCost(pricing);
          const isEditing = editingType === pricing.maintenance_type;
          
          return (
            <Card key={pricing.maintenance_type} className={`${isEditing ? 'ring-2 ring-blue-500' : ''}`}>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    {pricing.maintenance_type}
                  </span>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(pricing)}
                      className="flex items-center gap-1"
                    >
                      <Edit className="w-3 h-3" />
                      Edit
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {isEditing ? (
                  // Edit Form
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Default Labor Hours
                      </label>
                      <input
                        type="number"
                        name="default_labor_hours"
                        value={editFormData.default_labor_hours}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="0.25"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <DollarSign className="w-4 h-4 inline mr-1" />
                        Labor Rate (MAD/hour)
                      </label>
                      <input
                        type="number"
                        name="default_labor_rate_mad"
                        value={editFormData.default_labor_rate_mad}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Parts Cost (MAD)
                      </label>
                      <input
                        type="number"
                        name="default_parts_cost_mad"
                        value={editFormData.default_parts_cost_mad}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        name="description"
                        value={editFormData.description}
                        onChange={handleInputChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        placeholder="Description of this maintenance type"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleSave}
                        disabled={loading}
                        size="sm"
                        className="flex items-center gap-1 flex-1"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </Button>
                      <Button
                        onClick={handleCancel}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display Mode
                  <div className="space-y-4">
                    {/* Description */}
                    {pricing.description && (
                      <p className="text-sm text-gray-600">{pricing.description}</p>
                    )}

                    {/* Pricing Details */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Labor Hours:
                        </span>
                        <span className="font-medium">{pricing.default_labor_hours || 0}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          Labor Rate:
                        </span>
                        <span className="font-medium">
                          {MaintenanceTrackingService.formatCurrency(pricing.default_labor_rate_mad)}/hr
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Parts Cost:</span>
                        <span className="font-medium">
                          {MaintenanceTrackingService.formatCurrency(pricing.default_parts_cost_mad)}
                        </span>
                      </div>

                      <div className="border-t pt-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">Labor Cost:</span>
                          <span className="font-medium">
                            {MaintenanceTrackingService.formatCurrency(laborCost)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-blue-900">
                          <span className="flex items-center gap-1">
                            <Calculator className="w-4 h-4" />
                            Estimated Total:
                          </span>
                          <span>{MaintenanceTrackingService.formatCurrency(totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {safePricingCatalog.length === 0 && !loading && (
        <div className="text-center py-12">
          <Wrench className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No pricing catalog found</h3>
          <p className="text-gray-500 mb-4">
            The maintenance pricing catalog is empty or failed to load.
          </p>
          <Button onClick={loadPricingCatalog} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry Loading
          </Button>
        </div>
      )}

      {/* Help Section */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-2">Pricing Catalog Guidelines</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Auto-prefill:</strong> These values automatically populate maintenance forms to speed up data entry</li>
                <li>• <strong>Editable defaults:</strong> Staff can modify prefilled values for specific maintenance cases</li>
                <li>• <strong>Cost estimation:</strong> Estimated totals help with budgeting and customer quotes</li>
                <li>• <strong>Finance integration:</strong> Actual costs from maintenance records feed into financial reporting</li>
                <li>• <strong>Regular updates:</strong> Review and update pricing periodically to reflect current market rates</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenancePricingCatalog;