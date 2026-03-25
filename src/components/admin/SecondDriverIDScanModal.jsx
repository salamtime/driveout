import React, { useState, useEffect } from 'react';
import { 
  X, Upload, FileImage, Loader, CheckCircle, AlertCircle, User, 
  CreditCard, Calendar, MapPin, Scan, FileText, Globe, Mail, Phone,
  Eye, EyeOff, Shield, Database, UserPlus, Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import enhancedUnifiedCustomerService from '../../services/EnhancedUnifiedCustomerService';

const SecondDriverIDScanModal = ({ isOpen, onClose, onDriverAdded, title = "Add Second Driver" }) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [activeTab, setActiveTab] = useState('scan'); // 'scan' or 'manual'
  
  // Manual upload states
  const [manualUploadedImages, setManualUploadedImages] = useState([]);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualImagePreview, setManualImagePreview] = useState(null);
  
  const [manualData, setManualData] = useState({
    full_name: '',
    licence_number: '',
    id_number: '',
    date_of_birth: '',
    nationality: 'Moroccan',
    place_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    document_number: '',
    document_type: 'Driving License',
  });

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setExtractedData(null);
    setImageFile(null);
    setPreviewUrl(null);
    setScanError(null);
    setScanSuccess(false);
    setActiveTab('scan');
    setManualUploadedImages([]);
    setManualImagePreview(null);
    setManualData({
      full_name: '',
      licence_number: '',
      id_number: '',
      date_of_birth: '',
      nationality: 'Moroccan',
      place_of_birth: '',
      gender: '',
      phone: '',
      email: '',
      document_number: '',
      document_type: 'Driving License',
    });
  };

  const handleManualImageUpload = async (file) => {
    if (!file) return null;
    
    setManualUploading(true);
    try {
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `second_driver_manual_${timestamp}_${randomString}.${fileExtension}`;
      
      const { data, error } = await supabase.storage
        .from('customer-documents')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(data.path);
      
      const imageObj = {
        id: `manual_img_${timestamp}_${randomString}`,
        url: publicUrl,
        name: file.name,
        path: data.path,
        uploadedAt: new Date().toISOString()
      };
      
      setManualUploadedImages([imageObj]);
      setManualImagePreview(publicUrl);
      toast.success('Image uploaded successfully');
      
      return publicUrl;
    } catch (error) {
      console.error('❌ Error uploading manual image:', error);
      toast.error('Failed to upload image');
      return null;
    } finally {
      setManualUploading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    setUploading(true);
    setImageFile(file);
    
    try {
      // Create preview
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Start OCR scanning using the EnhancedUnifiedCustomerService directly
      await processImageWithService(file);
      
    } catch (error) {
      console.error('❌ File upload failed:', error);
      toast.error('Upload failed');
      setScanError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const processImageWithService = async (file) => {
    console.log("🎯 [MODAL] Starting scan for second driver");
    setScanning(true);
    setScanError(null);
    
    try {
      const result = await enhancedUnifiedCustomerService.processSecondDriverID(file);

      if (!result.success) {
        throw new Error(result.error || 'Scan failed');
      }

      // Extract OCR data from result
      const ocrData = result.data || result.extractedData || result.ocrResult?.data || {};
      const uploadedImageUrl = result.imageUrl || result.publicUrl || result.file_public_url || previewUrl || null;
      
      // Map to second driver format
      const mappedData = {
        full_name: ocrData.full_name || ocrData.fullName || ocrData.name || '',
        licence_number: ocrData.document_number || ocrData.idNumber || ocrData.licence_number || '',
        id_number: ocrData.id_number || ocrData.idNumber || ocrData.document_number || '',
        document_number: ocrData.document_number || ocrData.idNumber || '',
        document_type: ocrData.document_type || 'Driving License',
        date_of_birth: ocrData.date_of_birth || ocrData.dateOfBirth || ocrData.dob || '',
        nationality: ocrData.nationality || 'Moroccan',
        place_of_birth: ocrData.place_of_birth || ocrData.address || '',
        gender: ocrData.gender || '',
        phone: ocrData.phone || '',
        email: ocrData.email || '',
        id_scan_url: uploadedImageUrl,
        // Additional fields from OCR
        raw_name_scanned: ocrData.raw_name || '',
        given_name_scanned: ocrData.given_name || ocrData.first_name || '',
        family_name_scanned: ocrData.family_name || ocrData.last_name || '',
        country_scanned: ocrData.country || '',
        document_type_scanned: ocrData.document_type || '',
        scan_confidence: ocrData.confidence_estimate || 0.95,
        raw_ocr_data: ocrData,
        scan_metadata: {
          ...(result.scanMetadata || {}),
          ocr_unavailable: Boolean(result.ocrUnavailable),
          ocr_error: result.ocrError || null
        },
        scan_id: result.scanId,
        scan_number: result.scanNumber
      };

      setExtractedData(mappedData);
      setManualData(mappedData);
      if (uploadedImageUrl) {
        setManualUploadedImages([{
          id: `scan_img_${Date.now()}`,
          url: uploadedImageUrl,
          name: file.name || 'Scanned ID',
          uploadedAt: new Date().toISOString()
        }]);
        setManualImagePreview(uploadedImageUrl);
      }

      if (result.ocrUnavailable) {
        setScanSuccess(false);
        setScanError('Image uploaded, but OCR is unavailable right now. Please fill the driver details manually.');
        setActiveTab('manual');
        toast.info('Image uploaded. Complete the second driver details manually.');
        return;
      }

      setScanSuccess(true);
      setActiveTab('manual');
      toast.success('ID scanned. Review the details and tap Add Driver.');

    } catch (error) {
      console.error('❌ Scan error:', error);
      setScanError(error.message);
      toast.error('Scan failed');
      setActiveTab('manual');
    } finally {
      setScanning(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleManualInputChange = (field, value) => {
    setManualData(prev => ({ ...prev, [field]: value }));
  };

  const validateDriverData = () => {
    const { full_name, licence_number, id_number, document_number } = manualData;

    if (!full_name.trim()) {
      toast.error('Name is required');
      return false;
    }

    const hasIdentification = licence_number || id_number || document_number;
    if (!hasIdentification) {
      toast.error('ID or License number required');
      return false;
    }

    return true;
  };

  const handleAddDriver = async () => {
    if (activeTab === 'scan' && !scanSuccess) {
      setActiveTab('manual');
      toast.info('Complete the second driver details manually, then tap Add Driver.');
      return;
    }

    if (!validateDriverData()) {
      return;
    }

    setLoading(true);
    
    try {
      // Get image URL from either scan or manual upload
      const imageUrl = extractedData?.id_scan_url || 
                      (manualUploadedImages.length > 0 ? manualUploadedImages[0].url : null);
      
      const driverData = {
        id: `temp_sd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        full_name: manualData.full_name.trim(),
        phone: manualData.phone.trim() || null,
        email: manualData.email.trim() || null,
        licence_number: manualData.licence_number.trim() || null,
        id_number: manualData.id_number.trim() || null,
        document_number: manualData.document_number.trim() || null,
        document_type: manualData.document_type || 'Driving License',
        date_of_birth: manualData.date_of_birth || null,
        nationality: manualData.nationality.trim() || 'Moroccan',
        place_of_birth: manualData.place_of_birth.trim() || null,
        gender: manualData.gender.trim() || null,
        id_scan_url: imageUrl,
        customer_id_image: imageUrl,
        uploaded_images: manualUploadedImages.length > 0 ? manualUploadedImages : 
                        (extractedData?.id_scan_url ? [{
                          url: extractedData.id_scan_url,
                          name: 'Scanned ID',
                          uploadedAt: new Date().toISOString()
                        }] : []),
        extra_images: manualUploadedImages.length > 0 ? [imageUrl] : 
                     (extractedData?.id_scan_url ? [extractedData.id_scan_url] : []),
        scan_confidence: extractedData?.scan_confidence || 0.95,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (onDriverAdded) {
        onDriverAdded(driverData);
      }

      toast.success(`Driver "${driverData.full_name}" added!`);
      onClose();

    } catch (error) {
      console.error('❌ Error adding driver:', error);
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const canSubmitFromScan = scanSuccess;
  const canSubmit = !loading && !manualUploading && !scanning && (
    activeTab === 'manual' || canSubmitFromScan
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      {/* Mobile Bottom Sheet / Desktop Modal */}
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Add Second Driver</h2>
                <p className="text-gray-500 text-sm">Scan ID or enter manually</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex mt-4 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('scan')}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${activeTab === 'scan' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <Scan className="w-4 h-4" />
                Scan ID
              </div>
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${activeTab === 'manual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <User className="w-4 h-4" />
                Manual Entry
              </div>
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'scan' ? (
            /* Scan Section */
            <div className="mb-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Sparkles className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Scan ID Card</h3>
                <p className="text-gray-500 text-sm mt-1">Take a clear photo of driver's ID</p>
              </div>

              {/* Upload Area */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${previewUrl ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400'} ${uploading || scanning ? 'opacity-50' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !uploading && !scanning && document.getElementById('fileInput').click()}
              >
                <input
                  id="fileInput"
                  type="file"
                  accept="image/*,capture=camera"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading || scanning}
                />
                
                {uploading || scanning ? (
                  <div className="py-8">
                    <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-600">
                      {scanning ? 'Processing ID...' : 'Uploading...'}
                    </p>
                  </div>
                ) : previewUrl ? (
                  <div>
                    <div className="relative w-40 h-32 mx-auto mb-4 rounded-lg overflow-hidden border border-gray-200">
                      <img 
                        src={previewUrl} 
                        alt="ID Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Ready to Scan</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewUrl(null);
                        setImageFile(null);
                      }}
                      className="mt-3 text-sm text-red-500 hover:text-red-700"
                    >
                      Remove Photo
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-7 h-7 text-blue-600" />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">Upload ID Photo</p>
                    <p className="text-gray-500 text-sm mb-4">Tap or drag & drop</p>
                    <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileImage className="w-3 h-3" />
                        JPG, PNG
                      </span>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Auto-fill
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Scan Button */}
              {previewUrl && !scanSuccess && (
                <button
                  onClick={() => processImageWithService(imageFile)}
                  disabled={scanning}
                  className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      Scan ID Now
                    </>
                  )}
                </button>
              )}

              {/* Error Message */}
              {scanError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-red-700 font-medium">Scan failed</p>
                      <p className="text-red-600 text-xs mt-1">{scanError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className="mt-2 text-sm text-blue-600 font-medium"
                  >
                    Enter manually instead →
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Manual Entry Section */
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
                  <User className="w-6 h-6 text-gray-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Driver Details</h3>
                <p className="text-gray-500 text-sm">
                  {scanSuccess ? 'Review and edit the scanned details below' : 'Fill in the details below'}
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Full Name - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={manualData.full_name}
                    onChange={(e) => handleManualInputChange('full_name', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full name"
                  />
                </div>

                {/* Phone and Email - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={manualData.phone}
                      onChange={(e) => handleManualInputChange('phone', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+212"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={manualData.email}
                      onChange={(e) => handleManualInputChange('email', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* License No. and ID Number - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      License No.
                    </label>
                    <input
                      type="text"
                      value={manualData.licence_number}
                      onChange={(e) => handleManualInputChange('licence_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="License number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      ID Number
                    </label>
                    <input
                      type="text"
                      value={manualData.id_number}
                      onChange={(e) => handleManualInputChange('id_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="National ID"
                    />
                  </div>
                </div>

                {/* Date of Birth - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={manualData.date_of_birth}
                    onChange={(e) => handleManualInputChange('date_of_birth', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Place of Birth
                  </label>
                  <input
                    type="text"
                    value={manualData.place_of_birth}
                    onChange={(e) => handleManualInputChange('place_of_birth', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="City or place of birth"
                  />
                </div>

                {/* Nationality and Gender - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nationality
                    </label>
                    <select
                      value={manualData.nationality}
                      onChange={(e) => handleManualInputChange('nationality', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Moroccan">Moroccan</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Gender
                    </label>
                    <select
                      value={manualData.gender}
                      onChange={(e) => handleManualInputChange('gender', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Document Type
                    </label>
                    <select
                      value={manualData.document_type}
                      onChange={(e) => handleManualInputChange('document_type', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Driving License">Driving License</option>
                      <option value="National ID">National ID</option>
                      <option value="Passport">Passport</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Document Number
                    </label>
                    <input
                      type="text"
                      value={manualData.document_number}
                      onChange={(e) => handleManualInputChange('document_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Document number"
                    />
                  </div>
                </div>

                {/* Manual Image Upload Section - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Driver ID Image
                  </label>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                      manualUploadedImages.length > 0 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-300 hover:border-blue-400 bg-gray-50'
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith('image/')) {
                        await handleManualImageUpload(file);
                      }
                    }}
                    onClick={() => !manualUploading && document.getElementById('manual-image-input').click()}
                  >
                    <input
                      id="manual-image-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          await handleManualImageUpload(file);
                        }
                      }}
                      disabled={manualUploading}
                    />
                    
                    {manualUploading ? (
                      <div className="py-4">
                        <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Uploading...</p>
                      </div>
                    ) : manualUploadedImages.length > 0 ? (
                      <div>
                        <div className="relative w-24 h-24 mx-auto mb-3 rounded-lg overflow-hidden border border-green-200">
                          <img 
                            src={manualImagePreview || manualUploadedImages[0].url} 
                            alt="Driver ID"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://via.placeholder.com/96?text=ID';
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">ID Image Uploaded</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setManualUploadedImages([]);
                            setManualImagePreview(null);
                          }}
                          className="mt-2 text-xs text-red-500 hover:text-red-700"
                        >
                          Remove Image
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-gray-700 text-sm font-medium mb-1">Upload ID Photo</p>
                        <p className="text-gray-500 text-xs">Click or drag & drop</p>
                        <p className="text-xs text-gray-400 mt-2">JPG, PNG up to 10MB</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Back to Scan Option */}
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={() => setActiveTab('scan')}
                  className="flex items-center justify-center gap-2 text-blue-600 text-sm font-medium w-full py-2"
                >
                  ← Scan ID instead
                </button>
              </div>
                        </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 sm:p-6">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDriver}
              disabled={!canSubmit}
              className="flex-1 py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Add Driver
                </>
              )}
            </button>
          </div>
          
          {/* Info Note */}
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Database className="w-3 h-3" />
            <span>Saved to rental_second_drivers (no customer record created)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecondDriverIDScanModal;
