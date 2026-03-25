import React, { useState, useEffect } from 'react';
import { X, Save, Car, Fuel, Calculator, Calendar, DollarSign, Upload, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const VehicleRefillModal = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [formData, setFormData] = useState({
    refill_date: new Date().toISOString().split('T')[0],
    vehicle_id: '',
    liters: '',
    price_per_liter: '',
    odometer_km: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [invoiceImage, setInvoiceImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Load vehicles when modal opens
  useEffect(() => {
    if (isOpen) {
      loadVehicles();
      // Reset form when modal opens
      setFormData({
        refill_date: new Date().toISOString().split('T')[0],
        vehicle_id: '',
        liters: '',
        price_per_liter: '',
        odometer_km: '',
        notes: ''
      });
      setErrors({});
      setInvoiceImage(null);
      setImagePreview(null);
    }
  }, [isOpen]);

  const loadVehicles = async () => {
    try {
      console.log('🚗 Loading vehicles for refill modal...');
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, plate_number')
        .eq('status', 'available')
        .order('name');

      if (error) {
        console.error('❌ Error loading vehicles:', error);
        throw error;
      }

      console.log('✅ Vehicles loaded:', data?.length || 0);
      setVehicles(data || []);
    } catch (error) {
      console.error('❌ Error loading vehicles:', error);
      toast.error('Failed to load vehicles');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const calculateTotalCost = () => {
    const liters = parseFloat(formData.liters) || 0;
    const pricePerLiter = parseFloat(formData.price_per_liter) || 0;
    return (liters * pricePerLiter).toFixed(2);
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

    setInvoiceImage(file);

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
    setInvoiceImage(null);
    setImagePreview(null);
  };

  const uploadImageToStorage = async (file) => {
    try {
      console.log('📤 Uploading image to Supabase Storage...');
      
      // Generate unique filename with proper extension
      const fileExt = file.name.split('.').pop().toLowerCase();
      const fileName = `invoice-refill-${crypto.randomUUID()}.${fileExt}`;
      const filePath = fileName; // Don't add folder prefix since bucket is already 'fuel_invoices'

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('fuel_invoices')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('fuel_invoices')
        .getPublicUrl(filePath);

      console.log('✅ Image uploaded successfully:', uploadData);

      return {
        type: 'storage',
        path: filePath,
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        contentType: file.type,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error uploading to storage:', error);
      
      // Fallback to base64 storage in database
      console.log('📦 Falling back to base64 storage...');
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({
          type: 'base64',
          data: e.target.result,
          name: file.name,
          size: file.size,
          contentType: file.type,
          uploadedAt: new Date().toISOString()
        });
        reader.readAsDataURL(file);
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.refill_date) {
      newErrors.refill_date = 'Refill date is required';
    }

    if (!formData.vehicle_id) {
      newErrors.vehicle_id = 'Vehicle selection is required';
    }

    if (!formData.liters || parseFloat(formData.liters) <= 0) {
      newErrors.liters = 'Liters must be greater than 0';
    }

    if (!formData.price_per_liter || parseFloat(formData.price_per_liter) <= 0) {
      newErrors.price_per_liter = 'Price per liter must be greater than 0';
    }

    if (formData.odometer_km && parseFloat(formData.odometer_km) < 0) {
      newErrors.odometer_km = 'Odometer reading cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      console.log('💾 Saving vehicle refill:', formData);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Upload image if present
      let imageData = null;
      if (invoiceImage) {
        console.log('📤 Processing invoice image upload...');
        imageData = await uploadImageToStorage(invoiceImage);
      }

      // Use the correct field names that match the database schema
      const refillData = {
        refill_date: formData.refill_date,
        vehicle_id: formData.vehicle_id ? parseInt(formData.vehicle_id) : null, // FIXED Issue 3: Use null instead of empty string
        liters: parseFloat(formData.liters),
        price_per_liter: parseFloat(formData.price_per_liter),
        odometer_km: formData.odometer_km ? parseFloat(formData.odometer_km) : null,
        invoice_image: imageData,
        notes: formData.notes.trim() || null,
        created_by: user?.id
      };

      console.log('📤 Sending refill data to Supabase:', refillData);

      const { data, error } = await supabase
        .from('vehicle_fuel_refills')
        .insert([refillData])
        .select(`
          *,
          saharax_0u4w4d_vehicles (
            id,
            name,
            model,
            plate_number
          )
        `)
        .single();

      if (error) {
        console.error('❌ Error saving vehicle refill:', error);
        
        // If it's a schema cache issue, provide helpful error message
        if (error.code === 'PGRST204' && error.message.includes('invoice_image')) {
          setErrors({ 
            submit: 'Database schema cache needs refresh. Please wait a moment and try again, or contact support.' 
          });
        } else {
          setErrors({ submit: error.message });
        }
        return;
      }

      console.log('✅ Vehicle refill saved successfully:', data);
      
      // Show success message
      if (imageData && imageData.type === 'storage') {
        toast.success('Vehicle refill and invoice image saved successfully!');
      } else {
        toast.success('Vehicle refill saved successfully!');
      }
      
      // Reset form
      setFormData({
        refill_date: new Date().toISOString().split('T')[0],
        vehicle_id: '',
        liters: '',
        price_per_liter: '',
        odometer_km: '',
        notes: ''
      });
      setInvoiceImage(null);
      setImagePreview(null);

      onSuccess();
      onClose();
    } catch (error) {
      console.error('❌ Error saving vehicle refill:', error);
      setErrors({ submit: error.message || 'Failed to save vehicle refill' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        refill_date: new Date().toISOString().split('T')[0],
        vehicle_id: '',
        liters: '',
        price_per_liter: '',
        odometer_km: '',
        notes: ''
      });
      setErrors({});
      setInvoiceImage(null);
      setImagePreview(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  const totalCost = calculateTotalCost();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Fuel className="h-5 w-5 text-blue-600" />
            Add Vehicle Refill
          </h3>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 disabled:text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
              {errors.submit}
            </div>
          )}

          {/* Refill Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Refill Date *
            </label>
            <input
              type="date"
              name="refill_date"
              value={formData.refill_date}
              onChange={handleInputChange}
              disabled={loading}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.refill_date ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.refill_date && (
              <p className="mt-1 text-sm text-red-600">{errors.refill_date}</p>
            )}
          </div>

          {/* Vehicle Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle *
            </label>
            <select
              name="vehicle_id"
              value={formData.vehicle_id}
              onChange={handleInputChange}
              disabled={loading}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.vehicle_id ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} - {vehicle.model} ({vehicle.plate_number})
                </option>
              ))}
            </select>
            {errors.vehicle_id && (
              <p className="mt-1 text-sm text-red-600">{errors.vehicle_id}</p>
            )}
          </div>

          {/* Liters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Liters *
            </label>
            <input
              type="number"
              name="liters"
              value={formData.liters}
              onChange={handleInputChange}
              disabled={loading}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.liters ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.liters && (
              <p className="mt-1 text-sm text-red-600">{errors.liters}</p>
            )}
          </div>

          {/* Price per Liter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Price per Liter (MAD) *
            </label>
            <input
              type="number"
              name="price_per_liter"
              value={formData.price_per_liter}
              onChange={handleInputChange}
              disabled={loading}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.price_per_liter ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.price_per_liter && (
              <p className="mt-1 text-sm text-red-600">{errors.price_per_liter}</p>
            )}
          </div>

          {/* Total Cost (Auto-calculated) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Total Cost (MAD)
            </label>
            <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 font-medium">
              {totalCost} MAD
            </div>
          </div>

          {/* Odometer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Odometer (km)
            </label>
            <input
              type="number"
              name="odometer_km"
              value={formData.odometer_km}
              onChange={handleInputChange}
              disabled={loading}
              min="0"
              step="0.1"
              placeholder="Optional"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.odometer_km ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.odometer_km && (
              <p className="mt-1 text-sm text-red-600">{errors.odometer_km}</p>
            )}
          </div>

          {/* Invoice Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Image
            </label>
            
            {!invoiceImage ? (
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
                      disabled={loading}
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
                        {invoiceImage.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(invoiceImage.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    disabled={loading}
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

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              disabled={loading}
              rows={3}
              placeholder="Optional notes about this refill..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Refill
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleRefillModal;