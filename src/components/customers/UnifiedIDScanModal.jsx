import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Camera, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import geminiVisionOCR from '../../services/ocr/geminiVisionOcr';
import unifiedCustomerService from '../../services/UnifiedCustomerService';
import i18n from '../../i18n';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';

/**
 * UnifiedIDScanModal - Enhanced with comprehensive debugging and raw data display
 * 
 * Features:
 * - Google Gemini Vision OCR integration
 * - Comprehensive customer data extraction
 * - Raw data debugging and display
 * - Enhanced error handling and logging
 * - Form data population with detailed feedback
 */
const UnifiedIDScanModal = ({ 
  isOpen, 
  onClose, 
  onCustomerSaved, 
  onScanComplete,
  customerId = null,
  title = "Scanner le document d'identité",
  setFormData = null,
  formData = null,
  rentalId = null
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [savedCustomer, setSavedCustomer] = useState(null);
  
  const fileInputRef = useRef(null);
  useAdminModalFocus(isOpen, 'unified-id-scan');

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log('📁 Image selected:', file.name, file.size, 'bytes');
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      
      // Clear previous results
      setExtractedData(null);
      setError(null);
      setSuccess(null);
      setDebugInfo(null);
      setSavedCustomer(null);
    }
  };

  const processImage = async () => {
    if (!selectedImage) {
      setError(tr('Please select an image first', "Veuillez d'abord sélectionner une image"));
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setExtractedData(null);
    setDebugInfo(null);
    setSavedCustomer(null);

    try {
      console.log('🔍 Starting OCR processing with comprehensive debugging...');
      
      // Generate customer ID if not provided
      const targetCustomerId = customerId || unifiedCustomerService.generateCustomerId();
      console.log('👤 Target customer ID:', targetCustomerId);

      // Process with Google Gemini Vision OCR
      const result = await geminiVisionOCR.processIdDocument(selectedImage, targetCustomerId);
      
      console.log('🔍 === COMPLETE OCR RESULT ===');
      console.log('📊 Full result object:', JSON.stringify(result, null, 2));
      console.log('============================');

      if (result.success) {
        setExtractedData(result.data);
        setDebugInfo(result.debug);
        
        // Fetch the saved customer data to get the complete record
        if (result.customerId) {
          console.log('🔍 Fetching complete customer data from database...');
          const customerResult = await unifiedCustomerService.getCustomer(result.customerId);
          
          if (customerResult.success) {
            console.log('✅ Complete customer data fetched:', customerResult.data);
            setSavedCustomer(customerResult.data);
            
            // Call the callback with complete customer data
            if (onCustomerSaved) {
              console.log('📞 Calling onCustomerSaved with complete data...');
              onCustomerSaved(customerResult.data, selectedImage);
            }
            
            if (onScanComplete) {
              console.log('📞 Calling onScanComplete...');
              onScanComplete(customerResult.data, selectedImage);
            }
            
            // Update form data if setFormData is provided
            if (setFormData && formData) {
              console.log('📝 Updating form data directly...');
              setFormData(prev => ({
                ...prev,
                customer_name: customerResult.data.full_name || customerResult.data.customer_name || prev.customer_name,
                customer_email: customerResult.data.email || customerResult.data.customer_email || prev.customer_email,
                customer_phone: customerResult.data.phone || customerResult.data.customer_phone || prev.customer_phone,
                customer_id: customerResult.data.id,
                // Additional ID scan fields
                customer_licence_number: customerResult.data.licence_number || customerResult.data.document_number || prev.customer_licence_number,
                customer_id_number: customerResult.data.id_number || customerResult.data.document_number || prev.customer_id_number,
                customer_dob: customerResult.data.date_of_birth || prev.customer_dob,
                customer_place_of_birth: customerResult.data.place_of_birth || prev.customer_place_of_birth,
                customer_nationality: customerResult.data.nationality || prev.customer_nationality,
                customer_issue_date: customerResult.data.issue_date || prev.customer_issue_date
              }));
              console.log('✅ Form data updated successfully');
            }
            
            setSuccess(tr(`✅ ID document processed successfully! Customer data saved with ID: ${result.customerId}`, `✅ Document d'identité traité avec succès ! Données client enregistrées avec l'ID : ${result.customerId}`));
          } else {
            console.warn('⚠️ Could not fetch complete customer data:', customerResult.error);
            setSuccess(tr(`✅ ID document processed successfully! Customer ID: ${result.customerId}`, `✅ Document d'identité traité avec succès ! ID client : ${result.customerId}`));
          }
        } else {
          setSuccess(tr('✅ ID document processed successfully!', "✅ Document d'identité traité avec succès !"));
        }
        
      } else {
        setError(result.error || tr('Failed to process ID document', "Impossible de traiter le document d'identité"));
        setDebugInfo(result);
      }

    } catch (err) {
      console.error('❌ OCR processing error:', err);
      setError(tr(`OCR processing failed: ${err.message}`, `Le traitement OCR a échoué : ${err.message}`));
      setDebugInfo({ error: err.message, stack: err.stack });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedData(null);
    setError(null);
    setSuccess(null);
    setDebugInfo(null);
    setSavedCustomer(null);
    setShowRawData(false);
    onClose();
  };

  const renderFieldValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 italic">null</span>;
    }
    return <span className="text-gray-900">{String(value)}</span>;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isProcessing}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Image Upload Section */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="text-center">
              <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                {tr('Upload ID Document', "Téléverser le document d'identité")}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {tr("Supports Moroccan ID cards, driver's licenses, and passports", "Prend en charge les cartes d'identité marocaines, les permis de conduire et les passeports")}
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={isProcessing}
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Upload className="h-4 w-4 mr-2" />
                {tr('Choose Image', 'Choisir une image')}
              </button>
            </div>

            {/* Image Preview */}
            {imagePreview && (
              <div className="mt-4">
                <img
                  src={imagePreview}
                  alt="ID Document Preview"
                  className="max-w-full h-48 object-contain mx-auto border border-gray-200 rounded"
                />
              </div>
            )}
          </div>

          {/* Process Button */}
          {selectedImage && !isProcessing && (
            <div className="text-center">
              <button
                onClick={processImage}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Camera className="h-5 w-5 mr-2" />
                {tr('Process ID Document', "Traiter le document d'identité")}
              </button>
            </div>
          )}

          {/* Statut du traitement */}
          {isProcessing && (
            <div className="text-center">
              <div className="inline-flex items-center px-6 py-3 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {tr('Processing document with Google Gemini Vision...', 'Traitement du document avec Google Gemini Vision...')}
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3" />
                <div>
                  <h3 className="text-sm font-medium text-green-800">Succès !</h3>
                  <p className="text-sm text-green-700 mt-1">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Erreur</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Extracted Data Display */}
          {extractedData && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-blue-900">
                  {tr('Extracted Information', 'Informations extraites')}
                </h3>
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  {showRawData ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {showRawData ? tr('Hide', 'Masquer') : tr('Show', 'Afficher')} {tr('Raw Data', 'les données brutes')}
                </button>
              </div>

              {/* Formatted Data Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom complet</label>
                  <div className="mt-1 text-sm">{renderFieldValue(extractedData.full_name)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Numéro du document</label>
                  <div className="mt-1 text-sm">{renderFieldValue(extractedData.document_number)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('Date of Birth', 'Date de naissance')}</label>
                  <div className="mt-1 text-sm">{renderFieldValue(extractedData.date_of_birth)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('Nationality', 'Nationalité')}</label>
                  <div className="mt-1 text-sm">{renderFieldValue(extractedData.nationality)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('Gender', 'Genre')}</label>
                  <div className="mt-1 text-sm">{renderFieldValue(extractedData.gender)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{tr('Confidence', 'Confiance')}</label>
                  <div className="mt-1 text-sm">
                    {extractedData.confidence_estimate ? 
                      `${Math.round(extractedData.confidence_estimate * 100)}%` : 
                      tr('N/A', 'N/D')
                    }
                  </div>
                </div>
              </div>

              {/* Raw Data Display */}
              {showRawData && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{tr('Raw Extracted Data:', 'Données extraites brutes :')}</h4>
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(extractedData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Saved Customer Data Display */}
          {savedCustomer && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-green-900 mb-4">
                Données client enregistrées
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">ID client</label>
                  <div className="mt-1 text-sm font-mono">{savedCustomer.id}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom complet</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.full_name)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.email)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.phone)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Numéro d'identité</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.id_number)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Numéro de permis</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.licence_number)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date de naissance</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.date_of_birth)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nationalité</label>
                  <div className="mt-1 text-sm">{renderFieldValue(savedCustomer.nationality)}</div>
                </div>
              </div>

              {showRawData && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{tr('Complete Database Record:', 'Enregistrement complet en base de données :')}</h4>
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(savedCustomer, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Debug Information */}
          {debugInfo && showRawData && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-yellow-900 mb-4">
                {tr('Debug Information', 'Informations de débogage')}
              </h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={isProcessing}
            >
              {success ? tr('Done', 'Terminé') : tr('Cancel', 'Annuler')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedIDScanModal;
