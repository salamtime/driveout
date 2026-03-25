import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Camera, Loader, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { runOcr } from '../../services/ocr/runOcr.js';

/**
 * IDScanModal - Enhanced OCR modal for ID document scanning
 * Supports Morocco driving license extraction with comprehensive field mapping
 */
const IDScanModal = ({ 
  isOpen, 
  onClose, 
  setFormData,  // Function to update parent form data
  formData,     // Current form data
  onDataExtracted, // Legacy prop for backward compatibility
  title = "Scan ID Document" 
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResults, setOcrResults] = useState(null);
  const [error, setError] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const fileInputRef = useRef(null);

  // Add prop validation and debugging
  React.useEffect(() => {
    if (isOpen) {
      console.log('🔍 IDScanModal props:', { 
        isOpen, 
        onClose: typeof onClose, 
        setFormData: typeof setFormData, 
        onDataExtracted: typeof onDataExtracted,
        formData: !!formData 
      });
    }
  }, [isOpen, onClose, setFormData, onDataExtracted, formData]);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setIsProcessing(false);
    setOcrResults(null);
    setError(null);
    setShowRawData(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFileSelect = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setOcrResults(null);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError(null);
      setOcrResults(null);
      
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, []);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  const processImage = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select an image file first');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setOcrResults(null);

    try {
      console.log('🔍 Starting OCR processing...');
      const results = await runOcr(selectedFile, {
        documentType: 'morocco_driver_license',
        enableFieldExtraction: true,
        enableValidation: true
      });

      console.log('✅ OCR processing completed:', results);
      setOcrResults(results);

      if (results.validation?.isValid) {
        console.log('✅ OCR results are valid, ready for form population');
      } else {
        console.warn('⚠️ OCR validation issues:', results.validation?.errors);
      }

    } catch (err) {
      console.error('❌ OCR processing failed:', err);
      setError(err.message || 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile]);

  const handleUseData = useCallback(() => {
    console.log('🔍 handleUseData called');
    console.log('🔍 setFormData type:', typeof setFormData);
    console.log('🔍 onDataExtracted type:', typeof onDataExtracted);
    console.log('🔍 ocrResults:', ocrResults);
    
    if (!ocrResults || !ocrResults.fields) {
      console.error('❌ No OCR results or fields available');
      setError('No extracted data available to populate form.');
      return;
    }

    const extractedData = ocrResults.fields;
    console.log('🔍 Extracted data:', extractedData);
    
    // Try setFormData first (new approach)
    if (typeof setFormData === 'function') {
      console.log('✅ Using setFormData approach');
      
      try {
        // Create form data object with CORRECT field mapping
        const formDataUpdate = {};
        
        console.log('🔍 Mapping OCR fields to form fields...');
        
        // FIXED FIELD MAPPING - Map OCR fields to actual form field names
        if (extractedData.customer_full_name?.value || extractedData.full_name?.value) {
          const name = extractedData.customer_full_name?.value || extractedData.full_name?.value;
          formDataUpdate.customer_name = name;  // Maps to customer_name (not customer_full_name)
          console.log('✅ Mapped customer_name:', name);
        }
        
        if (extractedData.customer_licence_number?.value || extractedData.licence_number?.value) {
          const licenseNum = extractedData.customer_licence_number?.value || extractedData.licence_number?.value;
          formDataUpdate.customer_licence_number = licenseNum;
          console.log('✅ Mapped customer_licence_number:', licenseNum);
        }
        
        if (extractedData.customer_id_number?.value || extractedData.id_number?.value) {
          const idNum = extractedData.customer_id_number?.value || extractedData.id_number?.value;
          formDataUpdate.customer_id_number = idNum;
          console.log('✅ Mapped customer_id_number:', idNum);
        }
        
        if (extractedData.customer_dob?.value || extractedData.date_of_birth?.value) {
          const dob = extractedData.customer_dob?.value || extractedData.date_of_birth?.value;
          formDataUpdate.customer_dob = dob;
          console.log('✅ Mapped customer_dob:', dob);
        }
        
        if (extractedData.customer_place_of_birth?.value || extractedData.place_of_birth?.value) {
          const pob = extractedData.customer_place_of_birth?.value || extractedData.place_of_birth?.value;
          formDataUpdate.customer_place_of_birth = pob;
          console.log('✅ Mapped customer_place_of_birth:', pob);
        }
        
        if (extractedData.customer_nationality?.value || extractedData.nationality?.value) {
          const nationality = extractedData.customer_nationality?.value || extractedData.nationality?.value;
          formDataUpdate.customer_nationality = nationality;
          console.log('✅ Mapped customer_nationality:', nationality);
        }
        
        if (extractedData.customer_issue_date?.value || extractedData.issue_date?.value) {
          const issueDate = extractedData.customer_issue_date?.value || extractedData.issue_date?.value;
          formDataUpdate.customer_issue_date = issueDate;
          console.log('✅ Mapped customer_issue_date:', issueDate);
        }
        
        console.log('✅ Final form data update:', formDataUpdate);
        
        // Validate that we have at least some data to update
        if (Object.keys(formDataUpdate).length === 0) {
          console.warn('⚠️ No valid fields found to update');
          setError('No valid data found to populate the form. Please check the document quality.');
          return;
        }
        
        // Update form data using the provided setter function
        setFormData(prevData => ({
          ...prevData,
          ...formDataUpdate
        }));
        
        console.log('✅ Form data updated successfully via setFormData');
        console.log('✅ Updated fields:', Object.keys(formDataUpdate));
        
        // Show success message (you can customize this)
        alert(`✅ Successfully populated ${Object.keys(formDataUpdate).length} fields from the document!`);
        
        // Close modal after successful update
        handleClose();
        return;
        
      } catch (error) {
        console.error('❌ Error updating form data via setFormData:', error);
        setError('Error updating form data: ' + error.message);
        return;
      }
    }
    
    // Fallback to onDataExtracted (legacy approach)
    if (typeof onDataExtracted === 'function') {
      console.log('✅ Using onDataExtracted fallback approach');
      
      try {
        // Create formatted data for legacy callback
        const formattedData = {};
        
        // Map fields for legacy callback with correct field names
        Object.entries(extractedData).forEach(([key, field]) => {
          if (field && field.value) {
            // Map to correct field names
            if (key === 'customer_full_name' || key === 'full_name') {
              formattedData.customer_name = field.value;
            } else {
              formattedData[key] = field.value;
            }
          }
        });
        
        console.log('✅ Formatted data for legacy callback:', formattedData);
        
        onDataExtracted(formattedData, ocrResults);
        
        console.log('✅ Form data updated successfully via onDataExtracted');
        
        // Close modal after successful update
        handleClose();
        return;
        
      } catch (error) {
        console.error('❌ Error updating form data via onDataExtracted:', error);
        setError('Error updating form data: ' + error.message);
        return;
      }
    }
    
    // No valid update method available
    console.error('❌ Neither setFormData nor onDataExtracted is available as a function');
    console.error('❌ setFormData type:', typeof setFormData);
    console.error('❌ onDataExtracted type:', typeof onDataExtracted);
    setError('Error: Cannot populate form data. No valid update method available.');
    
  }, [ocrResults, setFormData, onDataExtracted, handleClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibent text-gray-900">{title}</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isProcessing}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - File Upload */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Upload Document</h3>
              
              {/* File Upload Area */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  PNG, JPG, GIF up to 10MB
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Preview */}
              {previewUrl && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Preview</h4>
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="w-full h-48 object-contain border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
              )}

              {/* Process Button */}
              <button
                onClick={processImage}
                disabled={!selectedFile || isProcessing}
                className={`w-full px-4 py-2 rounded-md font-medium flex items-center justify-center ${
                  !selectedFile || isProcessing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader className="animate-spin h-4 w-4 mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-2" />
                    Process Document
                  </>
                )}
              </button>
            </div>

            {/* Right Column - Results */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Extracted Data</h3>
                {ocrResults && (
                  <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    {showRawData ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                    {showRawData ? 'Hide' : 'Show'} Raw Data
                  </button>
                )}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center py-8">
                  <Loader className="animate-spin h-8 w-8 text-blue-600" />
                  <span className="ml-3 text-gray-600">Processing document...</span>
                </div>
              )}

              {ocrResults && !isProcessing && (
                <div className="space-y-4">
                  {/* Validation Status */}
                  {ocrResults.validation && (
                    <div className={`p-3 rounded-md ${
                      ocrResults.validation.isValid 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                      <div className="flex items-center">
                        <CheckCircle className={`h-4 w-4 ${
                          ocrResults.validation.isValid ? 'text-green-600' : 'text-yellow-600'
                        }`} />
                        <span className={`ml-2 text-sm font-medium ${
                          ocrResults.validation.isValid ? 'text-green-800' : 'text-yellow-800'
                        }`}>
                          {ocrResults.validation.isValid 
                            ? `✅ ${Object.keys(ocrResults.fields || {}).length} fields extracted successfully`
                            : `⚠️ ${ocrResults.validation.errors?.length || 0} validation issues`
                          }
                        </span>
                      </div>
                      
                      {ocrResults.validation.errors?.length > 0 && (
                        <div className="mt-2 text-sm text-yellow-700">
                          <ul className="list-disc list-inside">
                            {ocrResults.validation.errors.map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extracted Fields */}
                  {ocrResults.fields && Object.keys(ocrResults.fields).length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-900">Extracted Information</h4>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        {Object.entries(ocrResults.fields).map(([key, field]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700 capitalize">
                              {key.replace(/customer_|_/g, ' ').trim()}:
                            </span>
                            <div className="text-right">
                              <span className="text-sm text-gray-900">{field.value}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                ({Math.round(field.confidence * 100)}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Data Display */}
                  {showRawData && ocrResults.text && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-900">Raw OCR Text</h4>
                      <div className="bg-gray-100 rounded-lg p-3 text-xs font-mono text-gray-700 max-h-32 overflow-y-auto">
                        {ocrResults.text}
                      </div>
                    </div>
                  )}

                  {/* Use Data Button */}
                  {ocrResults.fields && Object.keys(ocrResults.fields).length > 0 && (
                    <button
                      onClick={handleUseData}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium flex items-center justify-center"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Use This Data
                    </button>
                  )}
                </div>
              )}

              {!ocrResults && !isProcessing && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Camera className="h-8 w-8 mr-3" />
                  <span>Upload and process a document to see extracted data</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default IDScanModal;