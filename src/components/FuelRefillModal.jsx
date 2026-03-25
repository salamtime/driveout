import React, { useState, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FuelRefillModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    refill_date: new Date().toISOString().split('T')[0],
    liters_added: '',
    unit_price: '',
    total_cost: '',
    fuel_type: 'gasoline',
    fuel_station: '',
    location: '',
    refilled_by: '',
    notes: '',
    invoice_image: null
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isManualOverride, setIsManualOverride] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        refill_date: new Date().toISOString().split('T')[0],
        liters_added: '',
        unit_price: '',
        total_cost: '',
        fuel_type: 'gasoline',
        fuel_station: '',
        location: '',
        refilled_by: '',
        notes: '',
        invoice_image: null
      });
      setErrors({});
      setImagePreview(null);
      setIsManualOverride(false);
    }
  }, [isOpen]);

  const resetToAutoCalculated = () => {
    const liters = parseFloat(formData.liters_added) || 0;
    const unitPrice = parseFloat(formData.unit_price) || 0;
    
    if (liters > 0 && unitPrice > 0) {
      setFormData(prev => ({
        ...prev,
        total_cost: (liters * unitPrice).toFixed(2)
      }));
      setIsManualOverride(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Handle manual override of total cost
    if (name === 'total_cost') {
      setIsManualOverride(true);
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
      return;
    }

    // Auto-calculate total cost when liters or unit price changes (only if not manually overridden)
    if ((name === 'liters_added' || name === 'unit_price') && !isManualOverride) {
      const liters = name === 'liters_added' ? parseFloat(value) || 0 : parseFloat(formData.liters_added) || 0;
      const unitPrice = name === 'unit_price' ? parseFloat(value) || 0 : parseFloat(formData.unit_price) || 0;
      
      if (liters > 0 && unitPrice > 0) {
        setFormData(prev => ({
          ...prev,
          total_cost: (liters * unitPrice).toFixed(2)
        }));
      }
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleImageUpload = (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'Please upload a JPG, PNG, GIF, or PDF file'
      }));
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'File size must be less than 10MB'
      }));
      return;
    }

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview('pdf');
    }

    setFormData(prev => ({
      ...prev,
      invoice_image: file
    }));

    // Clear error
    setErrors(prev => ({
      ...prev,
      invoice_image: ''
    }));
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleImageUpload(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    handleImageUpload(file);
  };

  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      invoice_image: null
    }));
    setImagePreview(null);
  };

  const uploadImageToStorage = async (file) => {
    console.log('📤 Uploading image to Supabase Storage (fuel_invoices bucket)...');
    
    // Generate unique filename matching the standard pattern
    const fileExt = file.name.split('.').pop().toLowerCase();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileName = `invoice-${timestamp}-${randomStr}.${fileExt}`;
    const filePath = `invoices/${fileName}`;

    console.log('📤 Upload path:', filePath);

    // Upload to Supabase Storage - NO FALLBACK, must succeed
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('fuel_invoices')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Storage upload failed:', uploadError);
      throw new Error(`Failed to upload invoice image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('fuel_invoices')
      .getPublicUrl(filePath);

    console.log('✅ Image uploaded successfully');
    console.log('🔗 Public URL:', urlData.publicUrl);

    // Return standardized JSONB format (storage type only)
    return {
      type: 'storage',
      path: filePath,
      url: urlData.publicUrl,
      name: file.name,
      size: file.size,
      contentType: file.type,
      uploadedAt: new Date().toISOString()
    };
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.refill_date) {
      newErrors.refill_date = 'Refill date is required';
    }

    if (!formData.liters_added || parseFloat(formData.liters_added) <= 0) {
      newErrors.liters_added = 'Liters must be greater than 0';
    }

    if (!formData.unit_price || parseFloat(formData.unit_price) <= 0) {
      newErrors.unit_price = 'Price per liter must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({}); // Clear previous submission errors

    try {
      // Upload image if present and get the JSONB data
      let imageData = null;
      if (formData.invoice_image) {
        console.log('📤 Processing invoice image upload...');
        imageData = await uploadImageToStorage(formData.invoice_image);
        console.log('✅ Image data prepared:', imageData);
      }

      // Calculate unit_price from cost/liters to ensure it's never null
      const litersAdded = parseFloat(formData.liters_added);
      const totalCost = parseFloat(formData.total_cost);
      const calculatedUnitPrice = litersAdded > 0 ? totalCost / litersAdded : 0;

      const refillData = {
        liters_added: litersAdded,
        unit_price: calculatedUnitPrice,
        total_cost: totalCost,
        fuel_type: formData.fuel_type,
        refill_date: formData.refill_date,
        fuel_station: formData.fuel_station,
        location: formData.location,
        refilled_by: formData.refilled_by,
        notes: formData.notes,
        invoice_image: imageData // STANDARDIZED: Only use invoice_image (JSONB format)
      };

      console.log('💾 Creating tank refill with JSONB invoice_image:', refillData);

      const { data, error } = await supabase
        .from('fuel_refills')
        .insert([refillData])
        .select('*')
        .single();

      if (error) {
        console.error('❌ Error creating tank refill:', error);
        setErrors({ submit: error.message });
        return;
      }

      console.log('✅ Tank refill created successfully:', data);
      
      // FIXED: Call onSave without parameters (parent expects no params)
      if (typeof onSave === 'function') {
        onSave();
      }
      
      onClose();
    } catch (error) {
      console.error('❌ Unexpected error creating tank refill:', error);
      setErrors({ submit: error.message || 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Add Tank Refill</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
              {errors.submit}
            </div>
          )}

          {/* Refill Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refill Date *
            </label>
            <input
              type="date"
              name="refill_date"
              value={formData.refill_date}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.refill_date ? 'border-red-300' : 'border-gray-300'
              }`}
              required
            />
            {errors.refill_date && (
              <p className="text-red-500 text-sm mt-1">{errors.refill_date}</p>
            )}
          </div>

          {/* Fuel Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Liters *
              </label>
              <input
                type="number"
                name="liters_added"
                value={formData.liters_added}
                onChange={handleInputChange}
                step="0.01"
                min="0.01"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.liters_added ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                required
              />
              {errors.liters_added && (
                <p className="text-red-500 text-sm mt-1">{errors.liters_added}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Liter (MAD) *
              </label>
              <input
                type="number"
                name="unit_price"
                value={formData.unit_price}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.unit_price ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                required
              />
              {errors.unit_price && (
                <p className="text-red-500 text-sm mt-1">{errors.unit_price}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                <span>Total Cost (MAD)</span>
                {isManualOverride ? (
                  <span className="text-xs text-orange-600 flex items-center gap-1">
                    ✏️ Manual Override
                    <button
                      type="button"
                      onClick={resetToAutoCalculated}
                      className="text-blue-600 hover:text-blue-800 underline ml-2"
                    >
                      Reset
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    🧮 Auto-calculated
                  </span>
                )}
              </label>
              <input
                type="number"
                name="total_cost"
                value={formData.total_cost}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isManualOverride 
                    ? 'border-orange-300 bg-orange-50' 
                    : 'border-gray-300 bg-green-50'
                }`}
                placeholder="0.00 MAD"
              />
              <p className="text-xs text-gray-500 mt-1">
                {isManualOverride 
                  ? '💡 Manually edited. Click Reset to return to auto-calculated value.' 
                  : '💡 Editable field. Enter custom amount if needed (e.g., for discounts).'}
              </p>
            </div>
          </div>

          {/* Fuel Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fuel Type
            </label>
            <select
              name="fuel_type"
              value={formData.fuel_type}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          {/* Location Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fuel Station
              </label>
              <input
                type="text"
                name="fuel_station"
                value={formData.fuel_station}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Station name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="City, area"
              />
            </div>
          </div>

          {/* Invoice Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Image
            </label>
            
            {!formData.invoice_image ? (
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label htmlFor="invoice-upload" className="cursor-pointer">
                    <span className="text-blue-600 hover:text-blue-500 font-medium">
                      Upload invoice image
                    </span>
                    <input
                      id="invoice-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*,.pdf"
                      onChange={handleFileInputChange}
                    />
                  </label>
                  <p className="text-gray-500 text-sm mt-1">
                    or drag and drop
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  JPG, PNG, GIF, PDF up to 10MB
                </p>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {imagePreview === 'pdf' ? (
                      <FileText className="h-8 w-8 text-red-500" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-blue-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formData.invoice_image.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(formData.invoice_image.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                
                {imagePreview && imagePreview !== 'pdf' && (
                  <div className="mt-3">
                    <img
                      src={imagePreview}
                      alt="Invoice preview"
                      className="max-w-full h-32 object-contain rounded border"
                    />
                  </div>
                )}
              </div>
            )}
            
            {errors.invoice_image && (
              <p className="text-red-500 text-sm mt-1">{errors.invoice_image}</p>
            )}
          </div>

          {/* Refilled By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refilled By
            </label>
            <input
              type="text"
              name="refilled_by"
              value={formData.refilled_by}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Person name"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes about this refill..."
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Refill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FuelRefillModal;