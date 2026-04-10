import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  X, Upload, Camera, Loader2, CheckCircle, AlertCircle, 
  Eye, EyeOff, FileImage, Clock, UserPlus, Database, 
  User, Sparkles, Smartphone, CameraIcon
} from 'lucide-react';
import enhancedUnifiedCustomerService, { saveCustomer } from '../../services/EnhancedUnifiedCustomerService';
import unifiedCustomerService from '../../services/UnifiedCustomerService';
import i18n from '../../i18n';

const EnhancedUnifiedIDScanModal = ({ 
  isOpen, 
  onClose, 
  onCustomerSaved, 
  onScanComplete,
  onImageSaved = null,
  customerId = null,
  title = null,
  setFormData = null,
  formData = null,
  rentalId = null,
  scanningForSecondDriver = false,
  autoProcessOnSelect = true,
  allowSaveWithoutOcr = false,
  saveWithoutOcrLabel = null
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingMode, setProcessingMode] = useState('scan');
  const [uploadMethod, setUploadMethod] = useState(''); // 'camera' or 'gallery'
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const processingTimeoutRef = useRef(null);
  const hasPrewarmedRef = useRef(false);

  const createAbortController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current;
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }

    setIsProcessing(false);
    setProcessingStatus('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    handleCancel();
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedData(null);
    setError(null);
    setSuccess(null);
    setProcessingStatus('');
    setProcessingMode('scan');
    onClose();
  }, [onClose, handleCancel]);

  useEffect(() => {
    if (!isOpen || hasPrewarmedRef.current) {
      return;
    }

    hasPrewarmedRef.current = true;
    void enhancedUnifiedCustomerService.prewarmOcrProxy();
  }, [isOpen]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleTakePhoto = () => {
    cameraInputRef.current?.click();
  };

  const handleOpenGallery = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    setSelectedImage(file);
    setError(null);
    setSuccess(null);
    setExtractedData(null);
    setProcessingStatus('');
    
    try {
      const url = URL.createObjectURL(file);
      setImagePreview(url);

      if (autoProcessOnSelect) {
        await processImage(file);
      }
      
    } catch (error) {
      console.error('❌ File upload failed:', error);
      setError(tr('Upload failed', 'Échec du téléversement'));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const processImage = async (fileToProcess = null) => {
    if (!fileToProcess && !selectedImage) {
      setError(tr('Please select an image first', "Veuillez d'abord sélectionner une image"));
      return;
    }

    const abortController = createAbortController();
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setProcessingMode('scan');

    processingTimeoutRef.current = setTimeout(() => {
      handleCancel();
      setError(tr('Processing timeout. Try a clearer image.', 'Délai de traitement dépassé. Essayez une image plus nette.'));
    }, 30000);

    try {
      let targetCustomerId = customerId;
      if (!targetCustomerId && formData?.customer_id) {
        targetCustomerId = formData.customer_id;
      }
      if (!targetCustomerId) {
        targetCustomerId = unifiedCustomerService.generateCustomerId();
      }
      
      if (abortController.signal.aborted) return;

      setProcessingStatus(scanningForSecondDriver ? tr('Processing second driver ID...', "Traitement de l'identité du second conducteur...") : tr('Scanning ID...', "Scan du document d'identité..."));
      
      const result = await enhancedUnifiedCustomerService.processCustomerID(
        (fileToProcess || selectedImage), 
        targetCustomerId, 
        rentalId,
        'document'
      );
      
      if (abortController.signal.aborted) return;

      if (result.success) {
        setProcessingStatus(tr('Scan complete', 'Scan terminé'));
        
        if (result.extractedData) {
          setExtractedData(result.extractedData);
        }
        
        if (abortController.signal.aborted) return;
        
        const ocrResult = result.extractedData;
        
        // SECOND DRIVER HANDLING
        if (scanningForSecondDriver) {
          const ocrData = result.ocrResult?.data || result.data || result;
          
          const documentNumber = 
            ocrData.document_number ||
            result.ocrResult?.data?.document_number ||
            result.document_number ||
            ocrData.documentNumber ||
            ocrData.licence_number ||
            '';
          
          const fullName = 
            ocrData.full_name ||
            result.ocrResult?.data?.full_name ||
            result.full_name ||
            ocrData.name ||
            '';
          
          const secondDriverData = {
            full_name: fullName,
            document_number: documentNumber,
            date_of_birth: ocrData.date_of_birth || result.ocrResult?.data?.date_of_birth || '',
            nationality: ocrData.nationality || ocrData.country || '',
            id_scan_url: result.publicUrl || result.file_public_url || ''
          };
          
          onScanComplete(secondDriverData, selectedImage);
          
        } else {
          // PRIMARY CUSTOMER HANDLING
          const documentNumber = ocrResult.idNumber || 
                                ocrResult.document_number || 
                                ocrResult.licence_number || '';
          
          const customerName = ocrResult.fullName || 
                              ocrResult.full_name || '';
          
          const dob = ocrResult.dateOfBirth || 
                     ocrResult.date_of_birth || '';
          
          const nationality = ocrResult.nationality || 'Moroccan';
          
          const dbCustomerData = {
            id: targetCustomerId,
            full_name: customerName,
            date_of_birth: dob ? dob.split('T')[0] : null,
            id_number: documentNumber,
            licence_number: documentNumber,
            nationality: nationality,
            id_scan_url: result.publicUrl || result.imageUrl || '',
            data_source: 'ocr_scan',
            initial_scan_complete: true,
            last_scan_at: new Date().toISOString(),
            scan_confidence: 0.95,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          
          const formCustomerData = {
            customer_id: targetCustomerId,
            customer_name: customerName,
            customer_dob: dob,
            customer_id_number: documentNumber,
            customer_licence_number: documentNumber,
            customer_nationality: nationality,
            id_scan_url: result.publicUrl || result.imageUrl || '',
            linked_display_id: documentNumber || ''
          };
          
          // Save through the shared customer service so duplicate licence/ID conflicts
          // recover against existing customer profiles instead of surfacing raw 409 errors.
          try {
            const customerSaveResult = await saveCustomer(
              {
                id: targetCustomerId,
                customer_name: customerName,
                customer_dob: dob,
                customer_id_number: documentNumber,
                customer_licence_number: documentNumber,
                customer_nationality: nationality,
                id_scan_url: result.publicUrl || result.imageUrl || '',
              },
              {
                file_public_url: result.publicUrl || result.imageUrl || '',
              },
              false
            );

            if (!customerSaveResult?.success) {
              console.warn('Database save warning:', customerSaveResult?.error || customerSaveResult);
            } else if (!result.ocrUnavailable) {
              setSuccess(tr(`Customer saved! ${customerName}`, `Client enregistré ! ${customerName}`));
            }
          } catch (dbError) {
            console.warn('Database save warning:', dbError);
          }
          
          // Update parent form
          if (setFormData) {
            setFormData(prev => ({
              ...prev,
              ...formCustomerData
            }));
          }
          
          if (result.ocrUnavailable) {
            setSuccess(null);
            setError(tr('ID image was captured, but OCR is unavailable right now. Please enter the customer name and ID number manually.', "L'image du document a été capturée, mais l'OCR est indisponible pour le moment. Veuillez saisir manuellement le nom du client et le numéro d'identité."));
          }

          // Call onScanComplete with both normalized form fields and raw OCR-derived fields
          if (onScanComplete) {
            onScanComplete(
              {
                ...ocrResult,
                ...formCustomerData,
                full_name: customerName,
                fullName: customerName,
                name: customerName,
                id_number: documentNumber,
                idNumber: documentNumber,
                document_number: documentNumber,
                imageUrl: result.publicUrl || result.imageUrl || '',
                publicUrl: result.publicUrl || result.imageUrl || '',
                ocrUnavailable: Boolean(result.ocrUnavailable),
                ocrError: result.ocrError || null,
              },
              (fileToProcess || selectedImage)
            );
          }
          
          // Auto-close only when OCR really produced usable extracted data
          if (!result.ocrUnavailable) {
            setTimeout(() => {
              handleClose();
            }, 1500);
          }
        }
        
      } else {
        setError(result.error || tr('Scan failed', 'Le scan a échoué'));
        setProcessingStatus(tr('Scan failed', 'Le scan a échoué'));
      }

    } catch (err) {
      console.error('❌ Process error:', err);
      setError(tr('Scan failed. Try again.', 'Le scan a échoué. Réessayez.'));
    } finally {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
      if (!abortController.signal.aborted) {
        setIsProcessing(false);
      }
    }
  };

  const handleSaveWithoutOcr = async () => {
    if (!selectedImage) {
      setError(tr('Please select an image first', "Veuillez d'abord sélectionner une image"));
      return;
    }

    const abortController = createAbortController();
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setProcessingMode('save');
    setProcessingStatus(tr('Saving ID...', "Enregistrement du document..."));

    try {
      const uploadResult = await enhancedUnifiedCustomerService.uploadDocumentOnly(selectedImage, {
        folder: scanningForSecondDriver ? 'second_drivers_ocr' : 'customers_ocr',
        prefix: customerId || rentalId || 'tour',
      });

      if (abortController.signal.aborted) return;

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Impossible d'enregistrer l'image");
      }

      const savedPayload = {
        imageUrl: uploadResult.publicUrl,
        publicUrl: uploadResult.publicUrl,
        id_scan_url: uploadResult.publicUrl,
        fileName: selectedImage.name,
        ocrSkipped: true,
      };

      if (onImageSaved) {
        onImageSaved(savedPayload, selectedImage);
      } else if (onScanComplete) {
        onScanComplete(savedPayload, selectedImage);
      }

      setSuccess(tr('Image saved. You can fill in the fields manually.', 'Image enregistrée. Vous pouvez remplir les champs manuellement.'));
      setTimeout(() => {
        handleClose();
      }, 150);
    } catch (err) {
      console.error('❌ Save image without OCR failed:', err);
      setError(err.message || 'Failed to save image');
    } finally {
      if (!abortController.signal.aborted) {
        setIsProcessing(false);
        setProcessingStatus('');
      }
    }
  };

  if (!isOpen) return null;

  const isOcrUnavailableMessage = Boolean(error && error.toLowerCase().includes('ocr is unavailable'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      {/* Mobile Bottom Sheet / Desktop Modal */}
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl h-[85vh] sm:h-auto max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <CameraIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  {title || (scanningForSecondDriver ? tr("Scan the second driver's ID", "Scanner l'identité du second conducteur") : tr("Scan ID document", "Scanner le document d'identité"))}
                </h2>
                <p className="text-gray-500 text-sm">
                  {scanningForSecondDriver ? tr("Scan the driver's ID document", "Scanner la pièce d'identité du conducteur") : tr("Take a photo of the ID or save it without OCR", "Prendre une photo de la pièce d'identité ou l’enregistrer sans OCR")}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Processing State */}
          {isProcessing ? (
            <div className="py-12 text-center">
              <div className="relative mx-auto w-24 h-24 mb-6">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse"></div>
                <Loader2 className="absolute inset-0 m-auto w-12 h-12 text-blue-600 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {processingMode === 'save' ? tr('Saving document', 'Enregistrement du document') : tr('Scanning document', 'Scan du document')}
              </h3>
              <p className="text-gray-500 text-sm mb-1">
                {processingMode === 'save' ? tr('Uploading image...', "Téléversement de l'image...") : tr('Extracting information...', 'Extraction des informations...')}
              </p>
              <p className="text-blue-600 text-xs font-medium">{processingStatus}</p>
              <button
                onClick={handleCancel}
                className="mt-6 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {tr('Cancel scan', 'Annuler le scan')}
              </button>
            </div>
          ) : imagePreview ? (
            <>
              {/* Preview State */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{tr('Ready to Scan', 'Prêt à scanner')}</h3>
                <p className="text-gray-500 text-sm">{tr('Photo captured successfully', 'Photo capturée avec succès')}</p>
              </div>
              
              <div className="relative w-48 h-36 mx-auto mb-6 rounded-xl overflow-hidden border-4 border-white shadow-lg">
                <img 
                  src={imagePreview} 
                  alt={tr('ID Preview', "Aperçu de la pièce d'identité")}
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setSelectedImage(null);
                  }}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50"
                >
                  {tr('Retake', 'Reprendre')}
                </button>
                <button
                  onClick={() => processImage()}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-95"
                >
                  <Sparkles className="w-4 h-4" />
                  {tr('Scan with OCR', 'Scanner avec OCR')}
                </button>
              </div>
              {allowSaveWithoutOcr && (
                <button
                  onClick={handleSaveWithoutOcr}
                  className="w-full py-3 border border-slate-300 bg-white text-slate-700 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-slate-50"
                >
                  <FileImage className="w-4 h-4" />
                  {saveWithoutOcrLabel || tr('Save image only', "Enregistrer l'image seulement")}
                </button>
              )}
            </>
          ) : (
            <>
              {/* Upload Options */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl mb-4">
                  <Camera className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{tr('Scan ID Card', "Scanner la pièce d'identité")}</h3>
                <p className="text-gray-500 text-sm">{tr('Take a clear photo for automatic data extraction', 'Prenez une photo nette pour l’extraction automatique des données')}</p>
              </div>

              <div className="space-y-4">
                {/* Camera Option */}
                <button
                  onClick={handleTakePhoto}
                  className="w-full p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl text-left flex items-center gap-4 hover:border-blue-300 transition-all"
                >
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                    <Camera className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{tr('Take Photo', 'Prendre une photo')}</div>
                    <div className="text-sm text-gray-500">{tr('Use camera now', 'Utiliser la caméra maintenant')}</div>
                  </div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                </button>

                {/* Gallery Option */}
                <button
                  onClick={handleOpenGallery}
                  className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl text-left flex items-center gap-4 hover:border-gray-300 transition-all"
                >
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                    <FileImage className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{tr('Choose from Gallery', 'Choisir depuis la galerie')}</div>
                    <div className="text-sm text-gray-500">{tr('Select existing photo', 'Sélectionner une photo existante')}</div>
                  </div>
                  <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                </button>

                {/* Drag & Drop Area */}
                <div
                  className="p-6 border-2 border-dashed border-gray-300 rounded-xl text-center hover:border-blue-400 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">{tr('Or drag & drop photo here', 'Ou glissez-déposez la photo ici')}</p>
                </div>
              </div>

              {/* Tips */}
              <div className="mt-8 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Sparkles className="w-4 h-4" />
                  {tr('Tips for best results', 'Conseils pour de meilleurs résultats')}
                </div>
                <ul className="space-y-1.5 text-xs text-gray-500">
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mt-1.5"></div>
                    <span>{tr('Ensure good lighting', 'Assurez un bon éclairage')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mt-1.5"></div>
                    <span>{tr('Place ID on flat surface', 'Placez la pièce sur une surface plane')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mt-1.5"></div>
                    <span>{tr('Avoid glare and shadows', 'Évitez les reflets et les ombres')}</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className={`mt-4 rounded-xl border p-4 ${isOcrUnavailableMessage ? 'border-amber-200 bg-amber-50' : 'border-red-100 bg-red-50'}`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${isOcrUnavailableMessage ? 'text-amber-500' : 'text-red-500'}`} />
                <div>
                  <p className={`font-medium ${isOcrUnavailableMessage ? 'text-amber-800' : 'text-red-700'}`}>
                    {isOcrUnavailableMessage ? 'Image capturée, saisie manuelle requise' : 'Le scan a échoué'}
                  </p>
                  <p className={`mt-1 text-sm ${isOcrUnavailableMessage ? 'text-amber-700' : 'text-red-600'}`}>{error}</p>
                  <button
                    onClick={() => {
                      setError(null);
                      setImagePreview(null);
                      setSelectedImage(null);
                    }}
                    className="mt-2 text-blue-600 text-sm font-medium"
                  >
                    {isOcrUnavailableMessage ? 'Utiliser une autre image →' : 'Réessayer →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-700 font-medium">{success}</span>
              </div>
              <p className="text-green-600 text-sm mt-1">{tr('Auto-closing...', 'Fermeture automatique...')}</p>
            </div>
          )}

          {/* Hidden Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3" />
              <span>
                {scanningForSecondDriver ? "rental_second_drivers" : tr('customers', 'clients')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              <span>{tr('AI-powered OCR', "OCR assisté par l'IA")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedUnifiedIDScanModal;
