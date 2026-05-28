import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { 
  X, Upload, Camera, Loader2, CheckCircle, AlertCircle, 
  Eye, EyeOff, FileImage, Clock, UserPlus, Database, 
  User, Sparkles, Smartphone, CameraIcon
} from 'lucide-react';
import enhancedUnifiedCustomerService, { saveCustomer } from '../../services/EnhancedUnifiedCustomerService';
import unifiedCustomerService from '../../services/UnifiedCustomerService';
import i18n from '../../i18n';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';
import { needsImageConversion, processOcrImage } from '../../utils/mediaProcessor';

const MOBILE_SCAN_MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const roundMs = (value) => Math.max(0, Math.round(Number(value) || 0));

const EnhancedUnifiedIDScanModal = ({ 
  isOpen, 
  onClose, 
  onCustomerSaved, 
  onScanComplete,
  onImageSaved = null,
  onImageSaveStateChange = null,
  customerId = null,
  title = null,
  setFormData = null,
  formData = null,
  rentalId = null,
  scanningForSecondDriver = false,
  autoProcessOnSelect = true,
  allowSaveWithoutOcr = false,
  saveWithoutOcrOnly = false,
  saveWithoutOcrLabel = null,
  ocrEnabled = true,
  verifiedIdentity = null,
  skipCustomerSave = false,
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
  const isOcrAvailable = ocrEnabled !== false;
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const processingTimeoutRef = useRef(null);
  const hasPrewarmedRef = useRef(false);
  const previewObjectUrlRef = useRef(null);
  useAdminModalFocus(isOpen, 'enhanced-id-scan');

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
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
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
    e.target.value = '';
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleTakePhoto = () => {
    setUploadMethod('camera');
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    cameraInputRef.current?.click();
  };

  const handleOpenGallery = () => {
    setUploadMethod('gallery');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const inferMimeTypeFromFile = useCallback((file) => {
    const normalizedType = String(file?.type || '').toLowerCase();
    if (normalizedType.startsWith('image/')) {
      return normalizedType;
    }

    const lowerName = String(file?.name || '').toLowerCase();
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.gif')) return 'image/gif';
    if (lowerName.endsWith('.bmp')) return 'image/bmp';
    if (lowerName.endsWith('.svg')) return 'image/svg+xml';
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) return 'image/heic';
    return 'image/png';
  }, []);

  const handleFileUpload = useCallback(async (file) => {
    if (!file) return;
    const uploadStartedAt = nowMs();
    let optimizationStartedAt = null;
    let optimizationCompletedAt = null;

    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    try {
      let normalizedFile = file;
      const previewStartedAt = nowMs();
      const initialObjectUrl = URL.createObjectURL(file);
      previewObjectUrlRef.current = initialObjectUrl;

      setSelectedImage(file);
      setImagePreview(initialObjectUrl);
      setError(null);
      setSuccess(null);
      setExtractedData(null);
      setProcessingStatus('');
      const initialPreviewReadyAt = nowMs();

      const shouldOptimizeForMobileScan =
        String(file?.type || '').startsWith('image/') &&
        (needsImageConversion(file) || Number(file?.size || 0) > MOBILE_SCAN_MAX_FILE_SIZE_BYTES);

      if (shouldOptimizeForMobileScan) {
        try {
          optimizationStartedAt = nowMs();
          const { blob } = await processOcrImage(file);
          optimizationCompletedAt = nowMs();
          const inferredMimeType = inferMimeTypeFromFile(file);
          const normalizedName = String(file.name || 'document')
            .replace(/\.(heic|heif|png|webp|bmp)$/i, '')
            .concat('.jpg');

          normalizedFile = new File([blob], normalizedName, {
            type: blob?.type || (needsImageConversion(file) ? 'image/jpeg' : inferredMimeType || 'image/jpeg'),
            lastModified: Date.now(),
          });

          const normalizedObjectUrl = URL.createObjectURL(normalizedFile);
          URL.revokeObjectURL(previewObjectUrlRef.current);
          previewObjectUrlRef.current = normalizedObjectUrl;
          setSelectedImage(normalizedFile);
          setImagePreview(normalizedObjectUrl);
        } catch (optimizationError) {
          console.warn('⚠️ Scan image optimization failed, continuing with original file:', optimizationError);
          normalizedFile = file;
        }
      }

      console.log('⏱️ [ID OCR MODAL] file selected', {
        sourceType: file?.type || 'unknown',
        sourceSizeMb: Number(((file?.size || 0) / 1024 / 1024).toFixed(2)),
        normalizedType: normalizedFile?.type || 'unknown',
        normalizedSizeMb: Number(((normalizedFile?.size || 0) / 1024 / 1024).toFixed(2)),
        optimizedBeforePreview: shouldOptimizeForMobileScan,
        optimizeMs: optimizationStartedAt && optimizationCompletedAt
          ? roundMs(optimizationCompletedAt - optimizationStartedAt)
          : 0,
        initialPreviewMs: roundMs(initialPreviewReadyAt - previewStartedAt),
        totalBeforePreviewMs: roundMs(initialPreviewReadyAt - uploadStartedAt),
        totalBeforeOcrMs: roundMs(nowMs() - uploadStartedAt),
      });

      if (autoProcessOnSelect && isOcrAvailable && !saveWithoutOcrOnly) {
        await processImage(normalizedFile);
      }
      
    } catch (error) {
      console.error('❌ File upload failed:', error);
      setError(tr('Upload failed', 'Échec du téléversement'));
    }
  }, [autoProcessOnSelect, inferMimeTypeFromFile, isOcrAvailable, saveWithoutOcrOnly, tr]);

  const handlePreviewError = useCallback(() => {
    if (!selectedImage || !imagePreview?.startsWith('blob:')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
    };
    reader.onerror = (previewError) => {
      console.error('❌ Failed to recover image preview:', previewError);
      setError(tr('Preview unavailable for this file. Please try another image.', "Aperçu indisponible pour ce fichier. Veuillez essayer une autre image."));
    };
    reader.readAsDataURL(selectedImage);
  }, [imagePreview, selectedImage, tr]);

  const handleDrop = (e) => {
    e.preventDefault();
    setUploadMethod('gallery');
    const droppedItem = Array.from(e.dataTransfer.items || []).find(
      (item) => item.kind === 'file'
    );
    const file = droppedItem?.getAsFile?.() || e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const isOcrServiceFailure = (message = '') => {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized.includes('ocr is unavailable') ||
      normalized.includes('api key must be replaced') ||
      normalized.includes('api key must be replaced or renewed') ||
      normalized.includes('api key expired') ||
      normalized.includes('api_key_invalid') ||
      normalized.includes('permission_denied') ||
      normalized.includes('service_blocked') ||
      normalized.includes('gemini api error: 400') ||
      normalized.includes('gemini api error: 403') ||
      normalized.includes("l'ocr est indisponible")
    );
  };

  const saveImageForManualEntry = async (imageFile) => {
    if (onImageSaveStateChange) {
      onImageSaveStateChange('saving');
    }

    const uploadResult = await enhancedUnifiedCustomerService.uploadDocumentOnly(imageFile, {
      folder: scanningForSecondDriver ? 'second_drivers_ocr' : 'customers_ocr',
      prefix: customerId || rentalId || 'tour',
    });

    if (!uploadResult.success) {
      if (onImageSaveStateChange) {
        onImageSaveStateChange('error');
      }
      throw new Error(uploadResult.error || "Impossible d'enregistrer l'image");
    }

    const savedPayload = {
      imageUrl: uploadResult.publicUrl,
      publicUrl: uploadResult.publicUrl,
      id_scan_url: uploadResult.publicUrl,
      fileName: imageFile?.name || selectedImage?.name || 'document.jpg',
      uploadMethod: uploadMethod || 'gallery',
      ocrSkipped: true,
      ocrUnavailable: true,
    };

    if (onImageSaved) {
      onImageSaved(savedPayload, imageFile);
    } else if (onScanComplete) {
      onScanComplete(savedPayload, imageFile);
    }

    if (onImageSaveStateChange) {
      onImageSaveStateChange('saved');
    }

    return savedPayload;
  };

  const processImage = async (fileToProcess = null) => {
    if (!isOcrAvailable) {
      setError(
        tr(
          'OCR auto-fill is not available on this plan. Save the image and continue manually.',
          "Le remplissage OCR n'est pas disponible sur ce forfait. Enregistrez l'image et continuez manuellement."
        )
      );
      return;
    }

    if (!fileToProcess && !selectedImage) {
      setError(tr('Please select an image first', "Veuillez d'abord sélectionner une image"));
      return;
    }

    const abortController = createAbortController();
    const processStartedAt = nowMs();
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setProcessingMode('scan');

    processingTimeoutRef.current = setTimeout(() => {
      handleCancel();
      setError(tr('Processing is taking longer than expected. Retry or continue manually.', 'Le traitement prend plus de temps que prévu. Réessayez ou continuez manuellement.'));
    }, 60000);

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
      const serviceStartedAt = nowMs();
      const result = await enhancedUnifiedCustomerService.processCustomerID(
        (fileToProcess || selectedImage), 
        targetCustomerId, 
        rentalId,
        'document'
      );
      const serviceCompletedAt = nowMs();
      
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

          const verifiedName =
            verifiedIdentity?.fullName ||
            verifiedIdentity?.customerName ||
            '';
          const verifiedEmail =
            verifiedIdentity?.email ||
            verifiedIdentity?.customerEmail ||
            '';
          const verifiedPhone =
            verifiedIdentity?.phone ||
            verifiedIdentity?.customerPhone ||
            '';
          const fallbackFormName =
            formData?.customer_name ||
            formData?.customerName ||
            formData?.full_name ||
            formData?.fullName ||
            '';
          const fallbackFormEmail =
            formData?.customer_email ||
            formData?.customerEmail ||
            formData?.email ||
            '';
          const fallbackFormPhone =
            formData?.customer_phone ||
            formData?.customerPhone ||
            formData?.phone ||
            '';

          const customerName = ocrResult.fullName || 
                              ocrResult.full_name || 
                              verifiedName ||
                              fallbackFormName || '';
          
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
            customer_email: verifiedEmail || fallbackFormEmail,
            customer_phone: verifiedPhone || fallbackFormPhone,
            customer_dob: dob,
            customer_id_number: documentNumber,
            customer_licence_number: documentNumber,
            customer_nationality: nationality,
            id_scan_url: result.publicUrl || result.imageUrl || '',
            linked_display_id: documentNumber || ''
          };
          
          const hasMinimumCustomerIdentity = Boolean(String(customerName || '').trim());

          if (!skipCustomerSave && !hasMinimumCustomerIdentity) {
            console.warn('Skipping customer save because OCR returned no usable identity fields.');
          }

          console.log('⏱️ [ID OCR MODAL] scan completed', {
            serviceMs: roundMs(serviceCompletedAt - serviceStartedAt),
            customerSaveQueued: Boolean(!skipCustomerSave && hasMinimumCustomerIdentity),
            totalModalMs: roundMs(nowMs() - processStartedAt),
            skipCustomerSave,
            ocrUnavailable: Boolean(result.ocrUnavailable),
            serviceTimings: result.timings || null,
          });
          
          // Update parent form
          if (setFormData) {
            setFormData(prev => ({
              ...prev,
              ...formCustomerData,
              customer_id: formCustomerData.customer_id,
              customer_name: formCustomerData.customer_name || prev.customer_name,
              customer_email: formCustomerData.customer_email || prev.customer_email,
              customer_phone: formCustomerData.customer_phone || prev.customer_phone,
              customer_dob: formCustomerData.customer_dob || prev.customer_dob,
              customer_id_number: formCustomerData.customer_id_number || prev.customer_id_number,
              customer_licence_number: formCustomerData.customer_licence_number || prev.customer_licence_number,
              customer_nationality: formCustomerData.customer_nationality || prev.customer_nationality,
            }));
          }
          
          if (result.ocrUnavailable) {
            setSuccess(null);
            setError(
              result.ocrError ||
                tr(
                  'ID image was captured, but OCR is unavailable right now. Please enter the customer name and ID number manually.',
                  "L'image du document a été capturée, mais l'OCR est indisponible pour le moment. Veuillez saisir manuellement le nom du client et le numéro d'identité."
                )
            );
          }

          // Call onScanComplete with both normalized form fields and raw OCR-derived fields
          if (onScanComplete) {
            onScanComplete(
              {
                ...ocrResult,
                ...formCustomerData,
                full_name: customerName || '',
                fullName: customerName || '',
                name: customerName || '',
                id_number: documentNumber || '',
                idNumber: documentNumber || '',
                document_number: documentNumber || '',
                licence_number: documentNumber || '',
                customer_licence_number: documentNumber || '',
                customer_id: formCustomerData.customer_id,
                phone: formCustomerData.customer_phone || '',
                email: formCustomerData.customer_email || '',
                imageUrl: result.publicUrl || result.imageUrl || '',
                publicUrl: result.publicUrl || result.imageUrl || '',
                uploadMethod: uploadMethod || 'camera',
                ocrUnavailable: Boolean(result.ocrUnavailable),
                ocrError: result.ocrError || null,
              },
              (fileToProcess || selectedImage)
            );
          }

          // Persist after the UI is already updated so mobile OCR feels instant.
          if (!skipCustomerSave && hasMinimumCustomerIdentity) {
            void (async () => {
              const customerSaveStartedAt = nowMs();
              try {
                const customerSaveResult = await saveCustomer(
                  {
                    id: targetCustomerId,
                    customer_name: customerName,
                    customer_email: verifiedEmail || fallbackFormEmail,
                    customer_phone: verifiedPhone || fallbackFormPhone,
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

                const customerSaveMs = roundMs(nowMs() - customerSaveStartedAt);
                if (!customerSaveResult?.success) {
                  console.warn('Database save warning:', customerSaveResult?.error || customerSaveResult);
                  return;
                }

                const resolvedSavedCustomer = customerSaveResult?.data || null;
                console.log('⏱️ [ID OCR MODAL] customer save completed', {
                  customerSaveMs,
                  customerId: resolvedSavedCustomer?.id || targetCustomerId,
                });

                if (resolvedSavedCustomer && onCustomerSaved) {
                  onCustomerSaved(
                    {
                      ...resolvedSavedCustomer,
                      customer_id: resolvedSavedCustomer.id || targetCustomerId,
                    },
                    result.publicUrl || result.imageUrl || ''
                  );
                }
              } catch (dbError) {
                console.warn('Database save warning:', dbError);
              }
            })();
          }
          
          // Auto-close only when OCR really produced usable extracted data
          if (!result.ocrUnavailable) {
            setTimeout(() => {
              handleClose();
            }, 1500);
          }
        }
        
      } else {
        if (allowSaveWithoutOcr && isOcrServiceFailure(result.error)) {
          await saveImageForManualEntry(fileToProcess || selectedImage);
          setError(null);
          setSuccess(
            tr(
              'ID image saved. Continue by entering the customer details manually.',
              "L'image du document a été enregistrée. Continuez en saisissant manuellement les détails du client."
            )
          );
          setProcessingStatus(tr('Image saved for manual entry', 'Image enregistrée pour saisie manuelle'));
          setTimeout(() => {
            handleClose();
          }, 150);
        } else {
          setError(result.error || tr('Scan failed', 'Le scan a échoué'));
          setProcessingStatus(tr('Scan failed', 'Le scan a échoué'));
        }
      }

    } catch (err) {
      console.error('❌ Process error:', err);
      if (allowSaveWithoutOcr && isOcrServiceFailure(err?.message)) {
        try {
          await saveImageForManualEntry(fileToProcess || selectedImage);
          setError(null);
          setSuccess(
            tr(
              'ID image saved. Continue by entering the customer details manually.',
              "L'image du document a été enregistrée. Continuez en saisissant manuellement les détails du client."
            )
          );
          setProcessingStatus(tr('Image saved for manual entry', 'Image enregistrée pour saisie manuelle'));
          setTimeout(() => {
            handleClose();
          }, 150);
        } catch (uploadError) {
          console.error('❌ Fallback save after OCR failure also failed:', uploadError);
          setError(uploadError?.message || err?.message || tr('Scan failed. Try again.', 'Le scan a échoué. Réessayez.'));
        }
      } else {
        setError(err?.message || tr('Scan failed. Try again.', 'Le scan a échoué. Réessayez.'));
      }
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
      if (abortController.signal.aborted) return;
      await saveImageForManualEntry(selectedImage);

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

  const isOcrUnavailableMessage = Boolean(
    error &&
      (
        error.toLowerCase().includes('ocr is unavailable') ||
        error.toLowerCase().includes('api key must be replaced') ||
        error.toLowerCase().includes('ocr est indisponible')
      )
  );
  const showSaveImageOnlyAction = Boolean(
    saveWithoutOcrOnly || !isOcrAvailable || isOcrUnavailableMessage
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      data-admin-modal-open="true"
    >
      {/* Mobile Bottom Sheet / Desktop Modal */}
      <div className="flex h-[85vh] max-h-[85vh] w-full flex-col overflow-hidden rounded-[32px] border border-violet-100 bg-white shadow-[0_24px_80px_rgba(76,29,149,0.18)] sm:h-auto sm:max-w-md">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-violet-100 bg-white/95 p-4 backdrop-blur sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <CameraIcon className="h-5 w-5 text-violet-600 sm:h-6 sm:w-6" />
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-2xl p-2 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
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
                  key={imagePreview}
                  src={imagePreview} 
                  alt={tr('ID Preview', "Aperçu de la pièce d'identité")}
                  onError={handlePreviewError}
                  className="h-full w-full object-contain bg-white"
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
                {!saveWithoutOcrOnly && isOcrAvailable && (
                  <button
                    onClick={() => processImage()}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    {tr('Scan with OCR', 'Scanner avec OCR')}
                  </button>
                )}
              </div>
              {showSaveImageOnlyAction && (
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
              <div className="mb-8 rounded-[28px] border border-violet-100 bg-gradient-to-b from-violet-50/80 to-white px-5 py-8 text-center shadow-[0_12px_34px_rgba(124,58,237,0.10)]">
                <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-violet-50 via-violet-100 to-indigo-50 shadow-[0_18px_40px_rgba(124,58,237,0.14)]">
                  <Camera className="h-9 w-9 text-violet-600" />
                </div>
                <h3 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">
                  {isOcrAvailable
                    ? tr('Scan ID Card', "Scanner la pièce d'identité")
                    : tr('Capture ID Card', "Capturer la pièce d'identité")}
                </h3>
                <p className="mx-auto max-w-xs text-sm text-slate-500">
                  {isOcrAvailable
                    ? tr('Take a clear photo for automatic data extraction', 'Prenez une photo nette pour l’extraction automatique des données')
                    : tr('Save a clear photo now and continue with manual details.', "Enregistrez une photo nette maintenant puis continuez avec les détails manuels.")}
                </p>
                {!isOcrAvailable && (
                  <p className="mx-auto mt-3 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                    {tr(
                      'OCR auto-fill is locked on this plan. ID image capture still works normally.',
                      "Le remplissage OCR est verrouillé sur ce forfait. La capture de la pièce d'identité reste disponible."
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                {/* Camera Option */}
                <button
                  onClick={handleTakePhoto}
                  className="flex w-full items-center gap-4 rounded-[26px] border border-violet-200 bg-gradient-to-r from-violet-50 via-violet-50 to-indigo-50 px-5 py-5 text-left shadow-[0_14px_34px_rgba(124,58,237,0.10)] transition-all hover:border-violet-300"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Camera className="h-7 w-7 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xl font-bold text-slate-900">{tr('Take Photo', 'Prendre une photo')}</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">{tr('Use camera now', 'Utiliser la caméra maintenant')}</div>
                  </div>
                  <div className="h-3 w-3 rounded-full bg-violet-600 shadow-[0_0_0_6px_rgba(124,58,237,0.12)]"></div>
                </button>

                {/* Gallery Option */}
                <button
                  onClick={handleOpenGallery}
                  className="flex w-full items-center gap-4 rounded-[26px] border border-slate-200 bg-white px-5 py-5 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 shadow-sm">
                    <FileImage className="h-7 w-7 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xl font-bold text-slate-900">{tr('Choose from Gallery', 'Choisir depuis la galerie')}</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">{tr('Select existing photo', 'Sélectionner une photo existante')}</div>
                  </div>
                  <div className="h-3 w-3 rounded-full bg-slate-400"></div>
                </button>

                {/* Drag & Drop Area */}
                <div
                  className="rounded-[26px] border-2 border-dashed border-violet-200 bg-violet-50/35 p-7 text-center transition-colors hover:border-violet-300"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Upload className="h-7 w-7 text-violet-400" />
                  </div>
                  <p className="text-base font-semibold text-slate-600">{tr('Or drag & drop photo here', 'Ou glissez-déposez la photo ici')}</p>
                </div>
              </div>

              {/* Tips */}
              <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/90 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  {tr('Tips for best results', 'Conseils pour de meilleurs résultats')}
                </div>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li className="flex items-start gap-2">
                    <div className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-300"></div>
                    <span>{tr('Ensure good lighting', 'Assurez un bon éclairage')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-300"></div>
                    <span>{tr('Place ID on flat surface', 'Placez la pièce sur une surface plane')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-300"></div>
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
        <div className="sticky bottom-0 border-t border-violet-100 bg-white/95 p-4 backdrop-blur">
          <button
            onClick={handleClose}
            className="flex w-full items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-base font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
            {tr('Cancel', 'Annuler')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EnhancedUnifiedIDScanModal;
