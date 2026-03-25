import React, { useState, useEffect } from 'react';
import { Info, Package, Plus, Edit, Trash2, CheckCircle, XCircle, Loader, X, Save, AlertCircle, Car, Filter, DollarSign, Clock, Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import KilometerPricingHelpModal from './KilometerPricingHelpModal';
import PackageService from '../services/PackageService';
import { supabase } from '../lib/supabase';

interface RentalPackage {
  id: number;
  name: string;
  description: string;
  vehicle_model_id: string;
  included_kilometers: number | null;
  extra_km_rate: number | null;
  fixed_amount: number | null;
  rate_type_id: number;
  is_active: boolean;
  vehicle_model?: {
    id: string;
    name: string;
    model: string;
    vehicle_type: string;
  };
}

interface RateType {
  id: number;
  name: string;
  is_kilometer_based: boolean;
}

interface VehicleModel {
  id: string;
  name: string;
  model: string;
  vehicle_type: string;
}

interface PackageFormData {
  name: string;
  description: string;
  vehicle_model_id: string;
  included_kilometers: number | null;
  extra_km_rate: number | null;
  fixed_amount: number | null;
  rate_type_id: number;
  is_active: boolean;
}

const getRateTypeIcon = (rateTypeName: string) => {
  switch(rateTypeName?.toLowerCase()) {
    case 'hourly':
      return <Clock className="w-4 h-4" />;
    case 'daily':
      return <Calendar className="w-4 h-4" />;
    case 'weekly':
      return <CalendarDays className="w-4 h-4" />;
    case 'monthly':
      return <CalendarRange className="w-4 h-4" />;
    default:
      return <Calendar className="w-4 h-4" />;
  }
};

const getRateTypeColor = (rateTypeName: string) => {
  switch(rateTypeName?.toLowerCase()) {
    case 'hourly':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'daily':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'weekly':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'monthly':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const KilometerPricingTab: React.FC = () => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [packages, setPackages] = useState<RentalPackage[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<RentalPackage[]>([]);
  const [rateTypes, setRateTypes] = useState<RateType[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterVehicleModel, setFilterVehicleModel] = useState<string>('');
  const [filterRateType, setFilterRateType] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  
  // Form state
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<RentalPackage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<PackageFormData>({
    name: '',
    description: '',
    vehicle_model_id: '',
    included_kilometers: null,
    extra_km_rate: null,
    fixed_amount: null,
    rate_type_id: 1,
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = packages;
    
    if (filterVehicleModel) {
      filtered = filtered.filter(pkg => pkg.vehicle_model_id === filterVehicleModel);
    }
    
    if (filterRateType) {
      filtered = filtered.filter(pkg => pkg.rate_type_id === parseInt(filterRateType));
    }
    
    setFilteredPackages(filtered);
  }, [filterVehicleModel, filterRateType, packages]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [packagesData, rateTypesData, vehicleModelsData] = await Promise.all([
        PackageService.getPackages(),
        PackageService.getRateTypes(),
        PackageService.getVehicleModels()
      ]);
      setPackages(packagesData);
      setFilteredPackages(packagesData);
      setRateTypes(rateTypesData);
      setVehicleModels(vehicleModelsData);
    } catch (err: any) {
      console.error('Error loading kilometer pricing data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      vehicle_model_id: '',
      included_kilometers: null,
      extra_km_rate: null,
      fixed_amount: null,
      rate_type_id: 1,
      is_active: true
    });
    setEditingPackage(null);
    setShowPackageForm(false);
    setError(null);
  };

  const handleCreatePackage = () => {
    resetForm();
    setShowPackageForm(true);
  };

  const handleEditPackage = (pkg: RentalPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      vehicle_model_id: pkg.vehicle_model_id || '',
      included_kilometers: pkg.included_kilometers,
      extra_km_rate: pkg.extra_km_rate,
      fixed_amount: pkg.fixed_amount,
      rate_type_id: pkg.rate_type_id,
      is_active: pkg.is_active
    });
    setShowPackageForm(true);
    setError(null);
  };

  const handleDeletePackage = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(id);
    setError(null);

    try {
      console.log('🗑️ Attempting to delete package ID:', id);
      
      // First, check if this package is used in any rentals
      const { data: rentals, error: checkError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_id')
        .eq('package_id', id);

      if (checkError) {
        console.error('Error checking rentals:', checkError);
        throw new Error('Failed to check package usage');
      }

      // If package is used in rentals, warn the user
      if (rentals && rentals.length > 0) {
        const confirmDelete = window.confirm(
          `This package is used in ${rentals.length} rental(s). Deleting it will remove the package association from these rentals. Continue?`
        );
        
        if (!confirmDelete) {
          setDeleteLoading(null);
          return;
        }
        
        // Update rentals to remove package association
        const { error: updateError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update({ package_id: null })
          .eq('package_id', id);
        
        if (updateError) {
          console.error('Error updating rentals:', updateError);
          throw new Error('Failed to update rentals');
        }
        
        console.log(`✅ Updated ${rentals.length} rentals to remove package association`);
      }

      // Check if package is used in mapping table
      const { data: mappings, error: mappingError } = await supabase
        .from('package_vehicle_type_mapping')
        .select('*')
        .eq('package_id', id);

      if (mappingError) {
        console.error('Error checking mappings:', mappingError);
        // Continue anyway, mapping might not exist
      }

      // Delete from mapping table first (if any exist)
      if (mappings && mappings.length > 0) {
        const { error: deleteMappingError } = await supabase
          .from('package_vehicle_type_mapping')
          .delete()
          .eq('package_id', id);
        
        if (deleteMappingError) {
          console.error('Error deleting mappings:', deleteMappingError);
          throw new Error('Failed to delete package mappings');
        }
        
        console.log(`✅ Deleted ${mappings.length} mapping entries`);
      }

      // Finally, delete the package itself
      const { error: deleteError } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Error deleting package:', deleteError);
        throw new Error(deleteError.message);
      }

      console.log('✅ Package deleted successfully');
      setSuccessMessage('Package deleted successfully!');
      
      // Refresh the packages list
      await loadData();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err: any) {
      console.error('❌ Error deleting package:', err);
      setError(err.message || 'Failed to delete package');
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleFormChange = (field: keyof PackageFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleVehicleModelChange = (vehicleModelId: string) => {
    setFormData(prev => ({
      ...prev,
      vehicle_model_id: vehicleModelId
    }));
  };

  const handleRateTypeChange = (rateTypeId: number) => {
    setFormData(prev => ({
      ...prev,
      rate_type_id: rateTypeId
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'Package name is required';
    }
    if (!formData.vehicle_model_id) {
      return 'Vehicle model is required';
    }
    if (!formData.rate_type_id) {
      return 'Rate type is required';
    }
    
    // All three pricing fields are required together
    if (!formData.fixed_amount || formData.fixed_amount <= 0) {
      return 'Fixed amount is required and must be greater than 0';
    }
    if (!formData.included_kilometers || formData.included_kilometers <= 0) {
      return 'Included kilometers is required and must be greater than 0';
    }
    if (!formData.extra_km_rate || formData.extra_km_rate <= 0) {
      return 'Overage rate is required and must be greater than 0';
    }
    
    return null;
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const validationError = validateForm();
  if (validationError) {
    setError(validationError);
    return;
  }

  setSubmitting(true);
  setError(null);

  try {
    // Log the data being sent
    console.log('📦 Submitting package data:', {
      name: formData.name,
      vehicle_model_id: formData.vehicle_model_id,
      rate_type_id: formData.rate_type_id,
      fixed_amount: formData.fixed_amount,
      included_kilometers: formData.included_kilometers,
      extra_km_rate: formData.extra_km_rate,
      is_active: formData.is_active
    });

    if (editingPackage) {
      await PackageService.updatePackage(editingPackage.id, formData);
      setSuccessMessage('Package updated successfully!');
    } else {
      await PackageService.createPackage(formData);
      setSuccessMessage('Package created successfully!');
    }
    
    setTimeout(() => setSuccessMessage(null), 3000);
    resetForm();
    await loadData();
  } catch (err: any) {
    console.error('Error saving package:', err);
    
    let errorMessage = err.message || 'Failed to save package';
    
    if (err.message?.includes('package_pricing_consistency')) {
      errorMessage = 'Package must have fixed amount, included kilometers, AND overage rate.';
    } else if (err.code === '23505') {
      errorMessage = 'A package with this name already exists for this vehicle model.';
    } else if (err.code === '23503') {
      errorMessage = 'Invalid vehicle model selected.';
    }
    
    setError(errorMessage);
  } finally {
    setSubmitting(false);
  }
};

  const getVehicleModelDisplay = (model: VehicleModel | undefined) => {
    if (!model) return 'Unknown Model';
    if (model.name && model.model) {
      if (model.name.toLowerCase().includes(model.model.toLowerCase())) {
        return model.name;
      }
      return `${model.name} ${model.model}`;
    }
    return model.name || model.model || 'Unknown';
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '0 MAD';
    return new Intl.NumberFormat('en-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount).replace('MAD', '').trim() + ' MAD';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-purple-600 animate-spin" />
        <span className="ml-3 text-gray-600">Loading packages...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-800 font-medium">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !showPackageForm && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Header with Info Button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={handleCreatePackage}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Package
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Filter className="w-5 h-5 text-gray-600" />
        
        {/* Vehicle Model Filter */}
        <select
          value={filterVehicleModel}
          onChange={(e) => setFilterVehicleModel(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">All Vehicle Models</option>
          {vehicleModels.map(model => (
            <option key={model.id} value={model.id}>
              {getVehicleModelDisplay(model)}
            </option>
          ))}
        </select>

        {/* Rate Type Filter */}
        <select
          value={filterRateType}
          onChange={(e) => setFilterRateType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">All Rate Types</option>
          {rateTypes.map(rt => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>

        {(filterVehicleModel || filterRateType) && (
          <button
            onClick={() => {
              setFilterVehicleModel('');
              setFilterRateType('');
            }}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Packages List */}
      {filteredPackages.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-2">
            {filterVehicleModel || filterRateType ? 'No packages found matching filters' : 'No packages created yet'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            {filterVehicleModel || filterRateType 
              ? 'Try clearing filters or select different options'
              : 'Create your first pricing package to get started'}
          </p>
          {!filterVehicleModel && !filterRateType && (
            <button
              onClick={() => setShowHelpModal(true)}
              className="text-purple-600 hover:text-purple-700 text-sm font-medium underline"
            >
              Learn how to create packages
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => {
            const rateType = rateTypes.find(rt => rt.id === pkg.rate_type_id);
            const rateTypeName = rateType?.name || 'Unknown';
            const rateTypeColor = getRateTypeColor(rateTypeName);
            const rateTypeIcon = getRateTypeIcon(rateTypeName);
            
            return (
              <div
                key={pkg.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{pkg.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{pkg.description}</p>
                    
                    {/* Rate Type Badge */}
                    <div className={`flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded-md w-fit border ${rateTypeColor}`}>
                      {rateTypeIcon}
                      <span className="font-medium">{rateTypeName}</span>
                    </div>
                    
                    {pkg.vehicle_model && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-md w-fit">
                        <Car className="w-3 h-3" />
                        <span className="font-medium">{getVehicleModelDisplay(pkg.vehicle_model)}</span>
                      </div>
                    )}
                  </div>
                  {pkg.is_active ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </div>
                
                <div className="space-y-2 text-sm">
                  {/* Fixed Amount - Main Price */}
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-1">
                    <span className="text-gray-600 font-medium">Package Price:</span>
                    <span className="font-bold text-lg text-green-600">{formatCurrency(pkg.fixed_amount)}</span>
                  </div>
                  
                  {/* Kilometer Details */}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Included KM:</span>
                    <span className="font-medium text-gray-900">{pkg.included_kilometers} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Overage Rate:</span>
                    <span className="font-medium text-gray-900">{pkg.extra_km_rate} MAD/km</span>
                  </div>

                  {/* Example Calculation for this rate type */}
                  <div className="mt-3 p-2 bg-gray-50 rounded-md text-xs">
                    <p className="text-gray-500 mb-1">Example usage:</p>
                    <div className="flex justify-between">
                      <span>Base {rateTypeName} price:</span>
                      <span>{formatCurrency(pkg.fixed_amount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Includes:</span>
                      <span>{pkg.included_kilometers} km free</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Extra km rate:</span>
                      <span>{pkg.extra_km_rate} MAD/km</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                  <button 
                    onClick={() => handleEditPackage(pkg)}
                    disabled={deleteLoading === pkg.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      deleteLoading === pkg.id 
                        ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                        : 'text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDeletePackage(pkg.id)}
                    disabled={deleteLoading === pkg.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      deleteLoading === pkg.id 
                        ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                        : 'text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {deleteLoading === pkg.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Package Form Modal */}
      {showPackageForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  {editingPackage ? 'Edit Package' : 'Create New Package'}
                </h3>
                <p className="text-sm text-purple-100 mt-1">
                  {editingPackage 
                    ? 'Update package details' 
                    : 'Create a package with fixed amount + kilometer limits'}
                </p>
              </div>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                disabled={submitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmitPackage} className="flex-1 overflow-y-auto p-6">
              {/* Error Message in Form */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Vehicle Model Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Model <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.vehicle_model_id}
                    onChange={(e) => handleVehicleModelChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a vehicle model</option>
                    {vehicleModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {getVehicleModelDisplay(model)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Package will be linked directly to this vehicle model
                  </p>
                </div>

                {/* Package Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Package Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 400 MAD Hourly Package, 500 MAD Daily Package, etc."
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Brief description of this package"
                    rows={2}
                  />
                </div>

                {/* Rate Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rate Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {rateTypes.map(rt => {
                      const isSelected = formData.rate_type_id === rt.id;
                      const colorClass = getRateTypeColor(rt.name);
                      const icon = getRateTypeIcon(rt.name);
                      
                      return (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => handleRateTypeChange(rt.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            isSelected 
                              ? `${colorClass} border-2 shadow-md scale-105` 
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {icon}
                          {rt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fixed Amount - Main Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fixed Amount (MAD) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={formData.fixed_amount || ''}
                      onChange={(e) => handleFormChange('fixed_amount', parseFloat(e.target.value) || null)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="400"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Total package price for this rate type (e.g., 400 MAD for Hourly, 500 MAD for Daily)
                  </p>
                </div>

                {/* Included Kilometers */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Included Kilometers <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.included_kilometers || ''}
                    onChange={(e) => handleFormChange('included_kilometers', parseInt(e.target.value) || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="100"
                    min="0"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Free kilometers included in the package price
                  </p>
                </div>

                {/* Overage Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overage Rate (MAD/km) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.extra_km_rate || ''}
                    onChange={(e) => handleFormChange('extra_km_rate', parseFloat(e.target.value) || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="2.00"
                    min="0"
                    step="0.01"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Price per kilometer beyond the included amount
                  </p>
                </div>

                {/* Example Preview based on selected rate type */}
{(formData.fixed_amount && formData.included_kilometers && formData.extra_km_rate && formData.rate_type_id) && (
  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
    <p className="text-xs font-medium text-blue-800 mb-2">
      Preview for selected {rateTypes.find(rt => rt.id === formData.rate_type_id)?.name} package (150 km total):
    </p>
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-blue-700">✓ First {formData.included_kilometers} km:</span>
        <span className="font-medium">{formatCurrency(formData.fixed_amount)}</span>
      </div>
      {150 > formData.included_kilometers && (
        <>
          <div className="flex justify-between text-orange-600">
            <span>✗ Extra km ({(150 - formData.included_kilometers)} km × {formData.extra_km_rate} MAD):</span>
            <span>+{formatCurrency((150 - formData.included_kilometers) * formData.extra_km_rate)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-blue-200 mt-1 pt-1">
            <span>Total for 150 km:</span>
            <span className="text-green-600">{formatCurrency(formData.fixed_amount + ((150 - formData.included_kilometers) * formData.extra_km_rate))}</span>
          </div>
        </>
      )}
      {150 <= formData.included_kilometers && (
        <div className="flex justify-between font-bold border-t border-blue-200 mt-1 pt-1">
          <span>Total for 150 km:</span>
          <span className="text-green-600">{formatCurrency(formData.fixed_amount)}</span>
        </div>
      )}
      <p className="text-gray-500 mt-1">
        <span className="font-medium">Calculation:</span> {formData.fixed_amount} MAD (first {formData.included_kilometers} km) + ({150 - formData.included_kilometers} km × {formData.extra_km_rate} MAD)
      </p>
    </div>
  </div>
)}

                {/* Is Active */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => handleFormChange('is_active', e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                    Active (available for new rentals)
                  </label>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmitPackage}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingPackage ? 'Update Package' : 'Create Package'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      <KilometerPricingHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
};

export default KilometerPricingTab;
