import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Car, 
  Plus, 
  Edit, 
  Upload, 
  FileText, 
  Calendar,
  Gauge,
  Wrench,
  AlertCircle,
  DollarSign,
  Receipt,
  X,
  Eye,
  Download,
  Trash2,
  CloudUpload,
  Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DocumentService from '../../services/DocumentService';
import VehicleImageService from '../../services/VehicleImageService';
import toast from 'react-hot-toast';

const VehicleFormModal = ({ 
  vehicle = null, 
  isOpen, 
  onClose, 
  onSuccess,
  mode = 'add' // 'add' | 'edit'
}) => {
  const isEditing = mode === 'edit' && !!vehicle;
  
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'Quad',
    engine_power_cc: 0,
    seating_capacity: 1,
    color: '',
    plate_number: '',
    status: 'available',
    current_odometer_km: 0,
    engine_hours: 0,
    last_oil_change_date: '',
    last_oil_change_odometer_km: 0,
    general_notes: '',
    system_notes: '',
    purchase_cost_mad: '',
    purchase_date: '',
    supplier: '',
    invoice_url: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [vehicleImages, setVehicleImages] = useState([]);
  const [plateError, setPlateError] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  
  // Drag and drop states
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  // Enhanced useEffect with proper service integration
  useEffect(() => {
    if (isEditing && vehicle && isOpen) {
      console.log('🔧 Loading vehicle data for editing:', vehicle.id);
      
      setFormData({
        name: vehicle.name || '',
        model: vehicle.model || '',
        vehicle_type: vehicle.vehicle_type || 'Quad',
        engine_power_cc: vehicle.engine_power_cc || 0,
        seating_capacity: vehicle.seating_capacity || 1,
        color: vehicle.color || '',
        plate_number: vehicle.plate_number || '',
        status: vehicle.status || 'available',
        current_odometer_km: vehicle.current_odometer_km || 0,
        engine_hours: vehicle.engine_hours || 0,
        last_oil_change_date: vehicle.last_oil_change_date || '',
        last_oil_change_odometer_km: vehicle.last_oil_change_odometer_km || 0,
        general_notes: vehicle.general_notes || '',
        system_notes: vehicle.system_notes || '',
        purchase_cost_mad: vehicle.purchase_cost_mad || '',
        purchase_date: vehicle.purchase_date || '',
        supplier: vehicle.supplier || '',
        invoice_url: vehicle.invoice_url || ''
      });
      
      // Load images and documents using proper services
      loadVehicleAssetsAsync(vehicle.id);
    } else if (!isEditing || !isOpen) {
      // Reset when not editing or modal closed
      setVehicleImages([]);
      setUploadedFiles([]);
    }
  }, [isEditing, vehicle, mode, isOpen]);

  // Async function to load vehicle assets using proper services
  const loadVehicleAssetsAsync = async (vehicleId) => {
    try {
      console.log('🔧 Loading vehicle assets for vehicle:', vehicleId);
      
      // Load images using VehicleImageService
      const images = await VehicleImageService.listVehicleImages(vehicleId);
      console.log('🔧 Loaded images:', images.length);
      setVehicleImages(images || []);
      
      // Load documents using DocumentService
      const documents = await DocumentService.getVehicleDocuments(vehicleId);
      console.log('🔧 Loaded documents:', documents.length);
      
      // Filter out images from documents (images should be handled by VehicleImageService)
      const nonImageDocuments = documents.filter(doc => 
        !doc.type || !doc.type.startsWith('image/')
      );
      setUploadedFiles(nonImageDocuments || []);
      
      // Handle legacy image_url field
      if (vehicle.image_url && images.length === 0) {
        console.log('🔧 Found legacy image_url, attempting migration:', vehicle.image_url);
        const migratedImage = await VehicleImageService.migrateVehicleImages(vehicleId, vehicle.image_url);
        if (migratedImage) {
          setVehicleImages([migratedImage]);
        }
      }
      
    } catch (error) {
      console.error('❌ Error loading vehicle assets:', error);
      toast.error('Failed to load vehicle images and documents');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    if (field === 'plate_number' && plateError) {
      setPlateError('');
    }
  };

  // Validate plate number uniqueness
  const validatePlateNumber = async (plateNumber) => {
    if (!plateNumber.trim()) {
      setPlateError('Plate number is required.');
      return false;
    }

    try {
      let query = supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id')
        .eq('plate_number', plateNumber.trim())
        .limit(1);

      if (isEditing && vehicle?.id) {
        query = query.neq('id', vehicle.id);
      }

      const { data, error } = await query;

      if (error) {
        return true;
      }

      if (data && data.length > 0) {
        setPlateError('This plate number is already assigned to another vehicle.');
        return false;
      }

      return true;
    } catch (error) {
      return true;
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter === 1) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      handleMultipleImageUploads(imageFiles);
    } else {
      toast.error('Please drop image files only (JPG, PNG, GIF, WebP)');
    }
  };

  // Handle multiple image uploads
  const handleMultipleImageUploads = async (files) => {
    if (files.length === 0) return;
    
    setImageUploading(true);
    
    try {
      const vehicleId = vehicle?.id || `temp_${Date.now()}`;
      const uploadPromises = files.map(file => VehicleImageService.uploadVehicleImage(file, vehicleId));
      
      toast.loading(`Uploading ${files.length} image(s)...`);
      
      const results = await Promise.all(uploadPromises);
      
      setVehicleImages(prev => [...prev, ...results]);
      
      toast.dismiss();
      toast.success(`${results.length} vehicle image(s) uploaded successfully`);
      
    } catch (error) {
      toast.dismiss();
      toast.error(`Failed to upload images: ${error.message}`);
    } finally {
      setImageUploading(false);
    }
  };

  // Single image upload (for click-to-upload)
  const handleImageUpload = async (file) => {
    if (!file) return;
    
    setImageUploading(true);
    
    try {
      toast.loading('Uploading vehicle image...');

      const vehicleId = vehicle?.id || `temp_${Date.now()}`;
      
      // Use VehicleImageService instead of DocumentService
      const imageObject = await VehicleImageService.uploadVehicleImage(file, vehicleId);
      
      setVehicleImages(prev => [...prev, imageObject]);
      
      toast.dismiss();
      toast.success('Vehicle image uploaded successfully');
      
    } catch (error) {
      toast.dismiss();
      toast.error(`Failed to upload image: ${error.message}`);
    } finally {
      setImageUploading(false);
    }
  };

  // Use VehicleImageService for image deletion
  const handleImageDelete = async (index) => {
    const imageToDelete = vehicleImages[index];
    
    try {
      if (imageToDelete?.storagePath) {
        // Use VehicleImageService for deletion
        await VehicleImageService.deleteVehicleImage(imageToDelete.storagePath);
      }
      
      setVehicleImages(prev => prev.filter((_, i) => i !== index));
      toast.success('Vehicle image removed');
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Failed to delete image');
    }
  };

  const handleDocumentUpload = async (files) => {
    try {
      const vehicleId = vehicle?.id || `temp_${Date.now()}`;
      
      const uploadPromises = Array.from(files).map(file => 
        DocumentService.uploadDocument(file, vehicleId)
      );
      
      const results = await Promise.all(uploadPromises);
      
      if (results && results.length > 0) {
        setUploadedFiles(prev => [...prev, ...results]);
        toast.success(`${results.length} document(s) uploaded successfully`);
      } else {
        toast.error('Failed to upload documents');
      }
    } catch (error) {
      toast.error(`Failed to upload documents: ${error.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.model || !formData.plate_number) {
      toast.error('Please fill in all required fields: Vehicle Name, Model, and Plate Number');
      return;
    }

    const isPlateValid = await validatePlateNumber(formData.plate_number);
    if (!isPlateValid) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Separate images and documents properly
      const allDocuments = [...uploadedFiles]; // Only non-image documents
      
      const vehicleData = {
        name: formData.name,
        model: formData.model,
        vehicle_type: formData.vehicle_type,
        engine_power_cc: parseInt(formData.engine_power_cc) || 0,
        seating_capacity: parseInt(formData.seating_capacity) || 1,
        color: formData.color,
        plate_number: formData.plate_number.trim(),
        status: formData.status,
        current_odometer_km: parseFloat(formData.current_odometer_km) || 0,
        engine_hours: parseFloat(formData.engine_hours) || 0,
        last_oil_change_date: formData.last_oil_change_date || null,
        last_oil_change_odometer_km: parseFloat(formData.last_oil_change_odometer_km) || 0,
        general_notes: formData.general_notes,
        system_notes: formData.system_notes,
        // Set image_url from VehicleImageService uploads
        image_url: vehicleImages.length > 0 ? vehicleImages[0].url : null,
        documents: allDocuments, // Only non-image documents
        purchase_cost_mad: formData.purchase_cost_mad ? parseFloat(formData.purchase_cost_mad) : null,
        purchase_date: formData.purchase_date || null,
        supplier: formData.supplier.trim() || null,
        invoice_url: formData.invoice_url.trim() || null
      };

      let result;
      if (isEditing) {
        result = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update(vehicleData)
          .eq('id', vehicle.id)
          .select();
      } else {
        result = await supabase
          .from('saharax_0u4w4d_vehicles')
          .insert([vehicleData])
          .select();
      }

      const { data, error } = result;

      if (error) {
        if (error.code === '23505' && error.message.includes('plate_number')) {
          setPlateError('This plate number is already assigned to another vehicle.');
          return;
        }
        throw error;
      }

      // For new vehicles, update temp image paths to real vehicle ID
      if (!isEditing && data && data[0] && vehicleImages.length > 0) {
        const newVehicleId = data[0].id;
        console.log('🔧 New vehicle created, updating image paths for vehicle:', newVehicleId);
        
        // Note: In a production system, you might want to move images from temp to real vehicle ID
        // For now, the images are already uploaded with temp ID which works fine
      }

      toast.success(`Vehicle ${isEditing ? 'updated' : 'created'} successfully`);
      onSuccess();
      
      if (!isEditing) {
        // Reset form for new vehicle
        setFormData({
          name: '',
          model: '',
          vehicle_type: 'Quad',
          engine_power_cc: 0,
          seating_capacity: 1,
          color: '',
          plate_number: '',
          status: 'available',
          current_odometer_km: 0,
          engine_hours: 0,
          last_oil_change_date: '',
          last_oil_change_odometer_km: 0,
          general_notes: '',
          system_notes: '',
          purchase_cost_mad: '',
          purchase_date: '',
          supplier: '',
          invoice_url: ''
        });
        setVehicleImages([]);
        setUploadedFiles([]);
      }
      setPlateError('');
    } catch (error) {
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} vehicle: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {isEditing ? `Edit Vehicle: ${vehicle?.name}` : 'Add New Vehicle'}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {isEditing ? 'Update vehicle information and manage assets' : 'Create a new vehicle with comprehensive fleet management'}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Vehicle Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., ATV-001, Raptor-Blue"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="model">Model *</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(e) => handleInputChange('model', e.target.value)}
                    placeholder="e.g., Yamaha Raptor 700, Honda TRX450R"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="vehicle_type">Vehicle Type *</Label>
                  <select
                    id="vehicle_type"
                    value={formData.vehicle_type}
                    onChange={(e) => handleInputChange('vehicle_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="Quad">Quad</option>
                    <option value="ATV">ATV</option>
                    <option value="UTV">UTV</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="engine_power_cc">Engine Power (CC)</Label>
                  <Input
                    id="engine_power_cc"
                    type="number"
                    min="0"
                    value={formData.engine_power_cc}
                    onChange={(e) => handleInputChange('engine_power_cc', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="seating_capacity">Seating Capacity</Label>
                  <Input
                    id="seating_capacity"
                    type="number"
                    min="1"
                    value={formData.seating_capacity}
                    onChange={(e) => handleInputChange('seating_capacity', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) => handleInputChange('color', e.target.value)}
                    placeholder="e.g., Red, Blue, Black, Camo"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="plate_number">Plate Number *</Label>
                  <Input
                    id="plate_number"
                    value={formData.plate_number}
                    onChange={(e) => handleInputChange('plate_number', e.target.value)}
                    placeholder="e.g., ABC-123, XYZ-456"
                    required
                    className={plateError ? 'border-red-500' : ''}
                  />
                  {plateError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {plateError}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="available">Available</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="rented">Rented</option>
                    <option value="tour">Tour</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="out_of_service">Out of Service</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>Scheduled:</strong> Vehicle has upcoming reservations
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase Cost Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Acquisition & Purchase Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchase_cost_mad">Purchase Cost (MAD)</Label>
                  <Input
                    id="purchase_cost_mad"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.purchase_cost_mad}
                    onChange={(e) => handleInputChange('purchase_cost_mad', e.target.value)}
                    placeholder="e.g., 45000.00"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="purchase_date">Purchase Date</Label>
                  <Input
                    id="purchase_date"
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => handleInputChange('purchase_date', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier / Seller</Label>
                  <Input
                    id="supplier"
                    value={formData.supplier}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    placeholder="e.g., Yamaha Morocco, Local Dealer"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="invoice_url">Invoice/Receipt URL</Label>
                  <Input
                    id="invoice_url"
                    type="url"
                    value={formData.invoice_url}
                    onChange={(e) => handleInputChange('invoice_url', e.target.value)}
                    placeholder="https://example.com/invoice.pdf"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Maintenance & Odometer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Maintenance & Odometer
              </CardTitle>
              <p className="text-sm text-gray-600">For New Vehicle</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="current_odometer_km">Current Odometer (km)</Label>
                  <Input
                    id="current_odometer_km"
                    type="number"
                    min="0"
                    value={formData.current_odometer_km}
                    onChange={(e) => handleInputChange('current_odometer_km', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="engine_hours">Engine Hours</Label>
                  <Input
                    id="engine_hours"
                    type="number"
                    min="0"
                    value={formData.engine_hours}
                    onChange={(e) => handleInputChange('engine_hours', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="last_oil_change_date">Last Oil Change Date</Label>
                  <Input
                    id="last_oil_change_date"
                    type="date"
                    value={formData.last_oil_change_date}
                    onChange={(e) => handleInputChange('last_oil_change_date', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="last_oil_change_odometer_km">Last Oil Change Odometer (km)</Label>
                  <Input
                    id="last_oil_change_odometer_km"
                    type="number"
                    min="0"
                    value={formData.last_oil_change_odometer_km}
                    onChange={(e) => handleInputChange('last_oil_change_odometer_km', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900">Maintenance Setup</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Set initial maintenance information for this vehicle. You can add detailed maintenance records after the vehicle is created.
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      💡 Tip: After creating the vehicle, you can access the full maintenance panel by editing the vehicle to add detailed maintenance records, schedule services, and track maintenance history with odometer-based oil change tracking.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Vehicle Images Section with Drag & Drop */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Vehicle Images
                <span className="text-xs text-blue-600 ml-2">
                  ({vehicleImages.length} images)
                </span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Drag and drop images or click to upload vehicle photos
              </p>
            </CardHeader>
            <CardContent>
              {/* Drag and Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
                  isDragOver 
                    ? 'border-blue-500 bg-blue-50 scale-105' 
                    : 'border-gray-300 hover:border-gray-400'
                } ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      handleMultipleImageUploads(files);
                      e.target.value = ''; // Reset input
                    }
                  }}
                  className="hidden"
                  id="vehicle-image-upload"
                  aria-label="Upload vehicle images"
                />
                
                <div className="space-y-4">
                  <div className={`transition-all duration-200 ${isDragOver ? 'scale-110' : ''}`}>
                    <CloudUpload className={`h-16 w-16 mx-auto ${
                      isDragOver ? 'text-blue-500' : 'text-gray-400'
                    }`} />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className={`text-lg font-medium ${
                      isDragOver ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {isDragOver ? 'Drop images here!' : 'Drag & drop vehicle images'}
                    </h3>
                    <p className={`text-sm ${
                      isDragOver ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      {isDragOver 
                        ? 'Release to upload your images' 
                        : 'or click the button below to browse files'
                      }
                    </p>
                  </div>
                  
                  <Button
                    type="button"
                    variant={isDragOver ? "default" : "outline"}
                    onClick={() => {
                      const input = document.getElementById('vehicle-image-upload');
                      if (input) input.click();
                    }}
                    disabled={imageUploading}
                    className={`transition-all duration-200 ${
                      isDragOver ? 'bg-blue-600 hover:bg-blue-700' : ''
                    }`}
                  >
                    {imageUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Choose Images
                      </>
                    )}
                  </Button>
                  
                  <p className="text-xs text-gray-500">
                    JPG, PNG, GIF, WebP up to 5MB each • Multiple files supported
                  </p>
                </div>
                
                {/* Drag overlay */}
                {isDragOver && (
                  <div className="absolute inset-0 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <div className="bg-white rounded-lg p-4 shadow-lg">
                      <CloudUpload className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                      <p className="text-blue-700 font-medium">Drop to upload</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Uploaded Images Grid */}
              {vehicleImages.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Uploaded Images ({vehicleImages.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vehicleImages.map((file, index) => (
                      <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="aspect-video bg-gray-100 rounded-lg mb-3 overflow-hidden">
                          <img 
                            src={file.url} 
                            alt={file.name}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              console.error('Image load error:', file.url);
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-xs">
                              Image
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              VIS
                            </Badge>
                          </div>
                          <h4 className="font-medium text-sm truncate">{file.name}</h4>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{file.size ? (file.size / 1024).toFixed(2) + ' KB' : 'N/A'}</span>
                            <span>{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(file.url, '_blank')}
                                className="h-8 w-8 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = file.url;
                                  link.download = file.name;
                                  link.click();
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleImageDelete(index)}
                              disabled={imageUploading}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents (Legal & Administrative)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {uploadedFiles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="aspect-video bg-gray-100 rounded-lg mb-3 overflow-hidden">
                        {file.type?.startsWith('image/') ? (
                          <img 
                            src={file.url} 
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileText className="h-12 w-12 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">
                            {file.category || 'Document'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            DS
                          </Badge>
                        </div>
                        <h4 className="font-medium text-sm truncate">{file.name}</h4>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{file.size ? (file.size / 1024).toFixed(2) + ' KB' : 'N/A'}</span>
                          <span>{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(file.url, '_blank')}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = file.url;
                                link.download = file.name;
                                link.click();
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setUploadedFiles(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No documents uploaded yet.</p>
                </div>
              )}
              
              <div className="mt-4 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.jpg,.png"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleDocumentUpload(files);
                      e.target.value = ''; // Reset input
                    }
                  }}
                  className="hidden"
                  id="document-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById('document-upload');
                    if (input) input.click();
                  }}
                >
                  Click to upload documents
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  PDF, DOC, DOCX, TXT, JPG, PNG up to 10MB each
                </p>
              </div>
              
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Document Upload Tips</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Upload registration, insurance, and maintenance documents</li>
                  <li>• Supported formats: PDF, DOC, DOCX, TXT, JPG, PNG</li>
                  <li>• Maximum file size: 10MB per file</li>
                  <li>• Multiple files can be uploaded at once</li>
                  <li>• Files are stored in vehicle-specific folders for organization</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="general_notes">General Notes</Label>
                <Textarea
                  id="general_notes"
                  value={formData.general_notes}
                  onChange={(e) => handleInputChange('general_notes', e.target.value)}
                  placeholder="Any additional notes about this vehicle, special instructions, known issues, modifications, etc..."
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="system_notes">System Notes</Label>
                <Textarea
                  id="system_notes"
                  value={formData.system_notes}
                  onChange={(e) => handleInputChange('system_notes', e.target.value)}
                  placeholder="Internal notes for staff, booking system notes, etc..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || plateError || imageUploading}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {isEditing ? <Edit className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {isEditing ? 'Update Vehicle' : 'Create Vehicle'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VehicleFormModal;
