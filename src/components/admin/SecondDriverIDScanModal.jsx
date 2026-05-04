import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Upload, FileImage, Loader, CheckCircle, AlertCircle, User, 
  CreditCard, Calendar, MapPin, Scan, FileText, Globe, Mail, Phone,
  Eye, EyeOff, Shield, Database, UserPlus, Sparkles, Camera, Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import enhancedUnifiedCustomerService from '../../services/EnhancedUnifiedCustomerService';
import { uploadFile } from '../../utils/storageUpload';
import i18n from '../../i18n';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';

const SecondDriverIDScanModal = ({
  isOpen,
  onClose,
  onDriverAdded,
  title = "Ajouter un second conducteur",
  autoLaunchPicker = false,
  scanOnlyMode = false,
  ocrEnabled = true,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
  const [primaryImageId, setPrimaryImageId] = useState(null);
  
  // Manual upload states
  const [manualUploadedImages, setManualUploadedImages] = useState([]);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualImagePreview, setManualImagePreview] = useState(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [capturedCameraPhotos, setCapturedCameraPhotos] = useState([]);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  useAdminModalFocus(isOpen, 'second-driver-id-scan');
  const liveVideoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const liveStreamRef = useRef(null);
  
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

  useEffect(() => {
    if (!isOpen || !autoLaunchPicker) return;

    const timeoutId = window.setTimeout(() => {
      const input = document.getElementById('fileInput');
      input?.click();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, autoLaunchPicker]);

  const resetForm = () => {
    setExtractedData(null);
    setImageFile(null);
    setPreviewUrl(null);
    setScanError(null);
    setScanSuccess(false);
    setActiveTab('scan');
    setManualUploadedImages([]);
    setManualImagePreview(null);
    setPrimaryImageId(null);
    setCameraModalOpen(false);
    setCameraStarting(false);
    setCameraError(null);
    capturedCameraPhotos.forEach((photo) => {
      if (photo?.url) URL.revokeObjectURL(photo.url);
    });
    setCapturedCameraPhotos([]);
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

  const stopCameraStream = () => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => track.stop());
      liveStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
      capturedCameraPhotos.forEach((photo) => {
        if (photo?.url) URL.revokeObjectURL(photo.url);
      });
    };
  }, [capturedCameraPhotos]);

  const uploadDriverImages = async (files, { replace = true } = {}) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!normalizedFiles.length) return [];

    setManualUploading(true);
    try {
      const uploadedImages = [];

      for (const file of normalizedFiles) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const fileName = `second_driver_manual_${timestamp}_${randomString}.${fileExtension}`;

        const uploadResult = await uploadFile(file, {
          bucket: 'customer-documents',
          fileName,
          optimizationProfile: 'document',
        });

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || tr('Failed to upload image', "Impossible de téléverser l'image"));
        }

        uploadedImages.push({
          id: `manual_img_${timestamp}_${randomString}`,
          url: uploadResult.url,
          name: file.name,
          file,
          path: uploadResult.path,
          uploadedAt: new Date().toISOString()
        });
      }

      setManualUploadedImages((prev) => {
        const nextImages = replace ? uploadedImages : [...prev, ...uploadedImages];
        const nextPrimaryId = replace
          ? (uploadedImages[0]?.id || null)
          : (primaryImageId || prev[0]?.id || uploadedImages[0]?.id || null);
        setPrimaryImageId(nextPrimaryId);
        setManualImagePreview(nextImages.find((image) => image.id === nextPrimaryId)?.url || nextImages[0]?.url || null);
        return nextImages;
      });
      toast.success(
        uploadedImages.length > 1
          ? tr('Images uploaded successfully', 'Images téléversées avec succès')
          : tr('Image uploaded successfully', 'Image téléversée avec succès')
      );

      return uploadedImages;
    } catch (error) {
      console.error('❌ Error uploading manual image:', error);
      toast.error(tr('Failed to upload image', "Impossible de téléverser l'image"));
      return [];
    } finally {
      setManualUploading(false);
    }
  };

  const handleManualImageUpload = async (fileOrFiles) => {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    return uploadDriverImages(files);
  };

  const openCameraCaptureModal = async () => {
    setCameraModalOpen(true);
    setCameraStarting(true);
    setCameraError(null);

    try {
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (primaryError) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      liveStreamRef.current = mediaStream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = mediaStream;
        await liveVideoRef.current.play().catch(() => {});
      }
    } catch (error) {
      console.error('❌ Camera access failed:', error);
      setCameraError(tr('Failed to access camera. Please check permissions.', "Impossible d'accéder à la caméra. Vérifiez les autorisations."));
    } finally {
      setCameraStarting(false);
    }
  };

  const closeCameraCaptureModal = () => {
    stopCameraStream();
    setCameraModalOpen(false);
    setCameraStarting(false);
    setCameraError(null);
  };

  const captureCameraPhoto = async () => {
    if (!liveVideoRef.current || !liveCanvasRef.current || !liveStreamRef.current) {
      setCameraError(tr('Camera is not ready yet.', "La caméra n'est pas encore prête."));
      return;
    }

    setCapturingPhoto(true);
    try {
      const video = liveVideoRef.current;
      const canvas = liveCanvasRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });

      if (!blob) {
        throw new Error(tr('Failed to capture photo', 'Impossible de capturer la photo'));
      }

      const timestamp = Date.now();
      const file = new File([blob], `second_driver_camera_${timestamp}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      setCapturedCameraPhotos((prev) => [
        ...prev,
        {
          id: `camera_${timestamp}`,
          file,
          blob,
          url,
          capturedAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('❌ Failed to capture camera photo:', error);
      setCameraError(error.message || tr('Failed to capture photo', 'Impossible de capturer la photo'));
    } finally {
      setCapturingPhoto(false);
    }
  };

  const removeCapturedCameraPhoto = (photoId) => {
    setCapturedCameraPhotos((prev) => {
      const photoToRemove = prev.find((photo) => photo.id === photoId);
      if (photoToRemove?.url) {
        URL.revokeObjectURL(photoToRemove.url);
      }
      return prev.filter((photo) => photo.id !== photoId);
    });
  };

  const saveCapturedCameraPhotos = async () => {
    if (!capturedCameraPhotos.length) {
      setCameraError(tr('Capture at least one photo first.', 'Capturez au moins une photo.'));
      return;
    }

    const uploadedImages = await uploadDriverImages(
      capturedCameraPhotos.map((photo) => photo.file),
      { replace: true }
    );

    if (!uploadedImages.length) return;

    setImageFile(capturedCameraPhotos[0].file);
    setPreviewUrl(uploadedImages[0].url);
    setScanSuccess(false);
    setScanError(null);
    setExtractedData(null);
    capturedCameraPhotos.forEach((photo) => {
      if (photo?.url) URL.revokeObjectURL(photo.url);
    });
    setCapturedCameraPhotos([]);
    closeCameraCaptureModal();
  };

  const handleFileUpload = async (fileOrFiles) => {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles.filter(Boolean) : [fileOrFiles].filter(Boolean);
    if (!files.length) return;
    const primaryFile = files[0];

    setUploading(true);
    setImageFile(primaryFile);
    
    try {
      const uploadedImages = files.length > 1
        ? await uploadDriverImages(files, { replace: true })
        : [];
      const previewSource = uploadedImages[0]?.url || URL.createObjectURL(primaryFile);
      setPreviewUrl(previewSource);
      
      // Start OCR immediately only for single-file imports when OCR is enabled.
      if (files.length === 1 && ocrEnabled) {
        await processImageWithService(primaryFile);
      } else {
        setScanSuccess(false);
        setScanError(null);
        setExtractedData(null);
      }
      
    } catch (error) {
      console.error('❌ File upload failed:', error);
      toast.error(tr('Upload failed', 'Échec du téléversement'));
      setScanError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const processImageWithService = async (file) => {
    if (!ocrEnabled) {
      setScanError(
        tr(
          'OCR auto-fill is not available on this plan. Complete the driver details manually.',
          "Le remplissage OCR n'est pas disponible sur ce forfait. Complétez manuellement les détails du conducteur."
        )
      );
      setActiveTab('manual');
      return;
    }

    console.log("🎯 [MODAL] Starting scan for second driver");
    setScanning(true);
    setScanError(null);
    
    try {
      const result = await enhancedUnifiedCustomerService.processSecondDriverID(file);

      if (!result.success) {
        throw new Error(result.error || tr('Scan failed', 'Le scan a échoué'));
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
        setManualUploadedImages((prev) => {
          if (prev.length > 0) {
            return prev;
          }
          return [{
            id: `scan_img_${Date.now()}`,
            url: uploadedImageUrl,
            name: file.name || 'ID scanné',
            uploadedAt: new Date().toISOString()
          }];
        });
        setManualImagePreview((prev) => prev || uploadedImageUrl);
      }

      if (result.ocrUnavailable) {
        setScanSuccess(false);
        if (scanOnlyMode) {
          if (onDriverAdded) {
            onDriverAdded(buildDriverData());
          }
          toast.info(tr('Image uploaded. You can complete the second driver fields in the form.', "Image téléversée. Vous pouvez compléter les champs du second conducteur dans le formulaire."));
          onClose();
        } else {
          setScanError(
            result.ocrError ||
            tr('Image uploaded, but OCR is unavailable right now. Please fill the driver details manually.', "Image téléversée, mais l'OCR est indisponible pour le moment. Veuillez remplir manuellement les détails du conducteur.")
          );
          setActiveTab('manual');
          toast.info(tr('Image uploaded. Complete the second driver details manually.', "Image téléversée. Complétez manuellement les détails du second conducteur."));
        }
        return;
      }

      setScanSuccess(true);
      if (scanOnlyMode) {
        if (onDriverAdded) {
          onDriverAdded(buildDriverData());
        }
        toast.success(tr('Second driver ID scanned and fields updated.', "L'identité du second conducteur a été scannée et les champs ont été mis à jour."));
        onClose();
      } else {
        setActiveTab('manual');
        toast.success(tr('ID scanned. Review the details and tap Add Driver.', "Identité scannée. Vérifiez les détails puis appuyez sur Ajouter le conducteur."));
      }

    } catch (error) {
      console.error('❌ Scan error:', error);
      setScanError(error.message);
      toast.error(error?.message || tr('Scan failed', 'Le scan a échoué'));
      if (!scanOnlyMode) {
        setActiveTab('manual');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((file) => file.type?.startsWith('image/'));
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleManualInputChange = (field, value) => {
    setManualData(prev => ({ ...prev, [field]: value }));
  };

  const getPrimaryManualImage = () => {
    if (manualUploadedImages.length === 0) return null;
    return manualUploadedImages.find((image) => image.id === primaryImageId) || manualUploadedImages[0];
  };

  const selectPrimaryImage = (imageId) => {
    setPrimaryImageId(imageId);
    const selectedImage = manualUploadedImages.find((image) => image.id === imageId);
    if (selectedImage?.url) {
      setManualImagePreview(selectedImage.url);
      setPreviewUrl(selectedImage.url);
    }
    if (selectedImage?.file) {
      setImageFile(selectedImage.file);
    }
  };

  const handleScanSelectedImage = async () => {
    const primaryImage = getPrimaryManualImage();
    const primaryFile = primaryImage?.file || imageFile;

    if (!primaryFile) {
      toast.error(tr('Please add a photo first.', 'Veuillez ajouter une photo d’abord.'));
      return;
    }

    setImageFile(primaryFile);
    setPreviewUrl(primaryImage?.url || previewUrl);
    await processImageWithService(primaryFile);
  };

  const removeManualUploadedImage = (imageId) => {
    setManualUploadedImages((prev) => {
      const nextImages = prev.filter((image) => image.id !== imageId);
      const nextPrimaryId = imageId === primaryImageId ? (nextImages[0]?.id || null) : primaryImageId;
      setPrimaryImageId(nextPrimaryId);
      const nextPrimaryImage = nextImages.find((image) => image.id === nextPrimaryId) || nextImages[0] || null;
      setManualImagePreview(nextPrimaryImage?.url || null);
      setPreviewUrl(nextPrimaryImage?.url || null);
      setImageFile(nextPrimaryImage?.file || null);
      return nextImages;
    });
  };

  const buildDriverData = () => {
    const imageUrl =
      extractedData?.id_scan_url ||
      (manualUploadedImages.length > 0 ? manualUploadedImages[0].url : null);
    const uploadedImageUrls = manualUploadedImages
      .map((image) => image?.url)
      .filter(Boolean);

    return {
      id: `temp_sd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      full_name: String(manualData.full_name || extractedData?.full_name || '').trim(),
      phone: String(manualData.phone || extractedData?.phone || '').trim() || null,
      email: String(manualData.email || extractedData?.email || '').trim() || null,
      licence_number: String(manualData.licence_number || extractedData?.licence_number || '').trim() || null,
      id_number: String(manualData.id_number || extractedData?.id_number || '').trim() || null,
      document_number: String(manualData.document_number || extractedData?.document_number || '').trim() || null,
      document_type: manualData.document_type || extractedData?.document_type || 'Permis de conduire',
      date_of_birth: manualData.date_of_birth || extractedData?.date_of_birth || null,
      nationality: String(manualData.nationality || extractedData?.nationality || 'Moroccan').trim(),
      place_of_birth: String(manualData.place_of_birth || extractedData?.place_of_birth || '').trim() || null,
      gender: String(manualData.gender || extractedData?.gender || '').trim() || null,
      id_scan_url: imageUrl,
      customer_id_image: imageUrl,
      uploaded_images: manualUploadedImages.length > 0 ? manualUploadedImages :
        (imageUrl ? [{
          url: imageUrl,
          name: imageFile?.name || 'ID scanné',
          uploadedAt: new Date().toISOString()
        }] : []),
      extra_images: uploadedImageUrls.length > 0 ? uploadedImageUrls : (imageUrl ? [imageUrl] : []),
      scan_confidence: extractedData?.scan_confidence || 0.95,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  const validateDriverData = () => {
    const { full_name, licence_number, id_number, document_number } = manualData;

    if (!full_name.trim()) {
      toast.error(tr('Name is required', 'Le nom est requis'));
      return false;
    }

    const hasIdentification = licence_number || id_number || document_number;
    if (!hasIdentification) {
      toast.error(tr('ID or License number required', "Le numéro d'identité ou de permis est requis"));
      return false;
    }

    return true;
  };

  const handleAddDriver = async () => {
    if (activeTab === 'scan' && !scanSuccess) {
      setActiveTab('manual');
      toast.info(tr('Complete the second driver details manually, then tap Add Driver.', "Complétez manuellement les détails du second conducteur, puis appuyez sur Ajouter le conducteur."));
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
      const uploadedImageUrls = manualUploadedImages
        .map((image) => image?.url)
        .filter(Boolean);
      
      const driverData = {
        id: `temp_sd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        full_name: manualData.full_name.trim(),
        phone: manualData.phone.trim() || null,
        email: manualData.email.trim() || null,
        licence_number: manualData.licence_number.trim() || null,
        id_number: manualData.id_number.trim() || null,
        document_number: manualData.document_number.trim() || null,
        document_type: manualData.document_type || 'Permis de conduire',
        date_of_birth: manualData.date_of_birth || null,
        nationality: manualData.nationality.trim() || 'Moroccan',
        place_of_birth: manualData.place_of_birth.trim() || null,
        gender: manualData.gender.trim() || null,
        id_scan_url: imageUrl,
        customer_id_image: imageUrl,
        uploaded_images: manualUploadedImages.length > 0 ? manualUploadedImages : 
                        (extractedData?.id_scan_url ? [{
                          url: extractedData.id_scan_url,
                          name: 'ID scanné',
                          uploadedAt: new Date().toISOString()
                        }] : []),
        extra_images: uploadedImageUrls.length > 0 ? uploadedImageUrls : 
                     (extractedData?.id_scan_url ? [extractedData.id_scan_url] : []),
        scan_confidence: extractedData?.scan_confidence || 0.95,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (onDriverAdded) {
        onDriverAdded(driverData);
      }

      toast.success(`Conducteur "${driverData.full_name}" ajouté !`);
      onClose();

    } catch (error) {
      console.error('❌ Error adding driver:', error);
      toast.error(`Échec : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const canSubmitFromScan = scanSuccess;
  const canSubmit = !loading && !manualUploading && !scanning && (
    activeTab === 'manual' || canSubmitFromScan
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[10050] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      data-admin-modal-open="true"
    >
      {/* Mobile Bottom Sheet / Desktop Modal */}
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
                <p className="text-gray-500 text-sm">
                  {scanOnlyMode ? "Scanner ou téléverser l'identité du second conducteur" : "Scanner l'identité ou saisir manuellement"}
                </p>
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
          {!scanOnlyMode && (
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
                Saisie manuelle
              </div>
            </button>
          </div>
          )}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {(scanOnlyMode || activeTab === 'scan') ? (
            /* Scan Section */
            <div className="mb-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Sparkles className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Scanner la carte d'identité</h3>
                <p className="text-gray-500 text-sm mt-1">Prenez une photo nette de l'identité du conducteur</p>
              </div>

              {/* Upload Area */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${previewUrl ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400'} ${uploading || scanning ? 'opacity-50' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  id="fileInput"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading || scanning}
                />
                
                {uploading || scanning ? (
                  <div className="py-8">
                    <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-600">
                      {scanning ? "Traitement de l'identité..." : 'Téléversement...'}
                    </p>
                  </div>
                ) : previewUrl ? (
                  <div>
                    <div className="relative w-40 h-32 mx-auto mb-4 rounded-lg overflow-hidden border border-gray-200">
                      <img 
                        src={previewUrl} 
                        alt="Aperçu de l'identité"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {manualUploadedImages.length > 1 && (
                      <div className="mb-4 flex justify-center gap-2 overflow-x-auto pb-1">
                        {manualUploadedImages.map((image) => (
                          <button
                            key={image.id}
                            type="button"
                            onClick={() => selectPrimaryImage(image.id)}
                            className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white ${image.id === primaryImageId ? 'border-blue-500 ring-2 ring-blue-200' : 'border-green-200'}`}
                          >
                            <img
                              src={image.url}
                              alt={image.name || 'ID'}
                              className="h-full w-full object-cover"
                            />
                            {image.id === primaryImageId && (
                              <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 px-1 py-0.5 text-[10px] font-semibold text-white">
                                {tr('Primary', 'Principale')}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">
                        {manualUploadedImages.length > 1
                          ? tr(`${manualUploadedImages.length} photos ready to scan`, `${manualUploadedImages.length} photos prêtes à être scannées`)
                          : tr('Ready to scan', 'Prêt à scanner')}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <button
                        type="button"
                        onClick={openCameraCaptureModal}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        <Camera className="w-4 h-4" />
                        {tr('Take Photo', 'Prendre une photo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => document.getElementById('fileInput')?.click()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Upload className="w-4 h-4" />
                        {tr('Choose from Gallery', 'Choisir depuis la galerie')}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUrl(null);
                        setImageFile(null);
                        setManualUploadedImages([]);
                        setManualImagePreview(null);
                      }}
                      className="mt-3 text-sm text-red-500 hover:text-red-700"
                    >
                      {tr('Remove photos', 'Supprimer les photos')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-7 h-7 text-blue-600" />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">{tr("Take photos or upload the driver's ID", "Prenez des photos ou téléversez la pièce d'identité")}</p>
                    <p className="text-gray-500 text-sm mb-4">
                      {ocrEnabled
                        ? tr('Use the camera for multiple shots, or import one from the gallery.', 'Utilisez la caméra pour plusieurs prises, ou importez-en une depuis la galerie.')
                        : tr('Capture or import the ID image, then complete the visible fields manually.', "Capturez ou importez l'image d'identité, puis complétez manuellement les champs visibles.")}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <button
                        type="button"
                        onClick={openCameraCaptureModal}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <Camera className="w-4 h-4" />
                        {tr('Take Photo', 'Prendre une photo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => document.getElementById('fileInput')?.click()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Upload className="w-4 h-4" />
                        {tr('Choose from Gallery', 'Choisir depuis la galerie')}
                      </button>
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileImage className="w-3 h-3" />
                        JPG, PNG
                      </span>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Remplissage auto
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Scan Button */}
              {previewUrl && !scanSuccess && (
                ocrEnabled ? (
                  <button
                    onClick={handleScanSelectedImage}
                    disabled={scanning}
                    className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
                  >
                    {scanning ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Scan en cours...
                      </>
                    ) : (
                      <>
                        <Scan className="w-4 h-4" />
                        Scanner maintenant
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('manual')}
                    className="w-full mt-4 rounded-xl border border-slate-300 bg-white py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {tr('Continue without OCR', 'Continuer sans OCR')}
                  </button>
                )
              )}

              {/* Error Message */}
              {scanError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-red-700 font-medium">Le scan a échoué</p>
                      <p className="text-red-600 text-xs mt-1">{scanError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className="mt-2 text-sm text-blue-600 font-medium"
                  >
                    Saisir manuellement à la place →
                  </button>
                </div>
              )}

              {manualUploadedImages.length > 1 && !scanSuccess && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  {tr('Tap a thumbnail to choose the primary scan image.', 'Touchez une miniature pour choisir l’image principale du scan.')}
                </p>
              )}
            </div>
          ) : (
            /* Manual Entry Section */
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
                  <User className="w-6 h-6 text-gray-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Détails du conducteur</h3>
                <p className="text-gray-500 text-sm">
                  {scanSuccess ? 'Vérifiez et modifiez les détails scannés ci-dessous' : 'Renseignez les détails ci-dessous'}
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Full Name - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    value={manualData.full_name}
                    onChange={(e) => handleManualInputChange('full_name', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Saisir le nom complet"
                  />
                </div>

                {/* Phone and Email - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Téléphone
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
                      E-mail
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
                      N° de permis
                    </label>
                    <input
                      type="text"
                      value={manualData.licence_number}
                      onChange={(e) => handleManualInputChange('licence_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Numéro de permis"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      N° d'identité
                    </label>
                    <input
                      type="text"
                      value={manualData.id_number}
                      onChange={(e) => handleManualInputChange('id_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Identité nationale"
                    />
                  </div>
                </div>

                {/* Date of Birth - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Date de naissance
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
                    Lieu de naissance
                  </label>
                  <input
                    type="text"
                    value={manualData.place_of_birth}
                    onChange={(e) => handleManualInputChange('place_of_birth', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ville ou lieu de naissance"
                  />
                </div>

                {/* Nationality and Gender - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nationalité
                    </label>
                    <select
                      value={manualData.nationality}
                      onChange={(e) => handleManualInputChange('nationality', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Moroccan">Marocaine</option>
                      <option value="Other">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Genre
                    </label>
                    <select
                      value={manualData.gender}
                      onChange={(e) => handleManualInputChange('gender', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sélectionner</option>
                      <option value="Male">Homme</option>
                      <option value="Female">Femme</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Type de document
                    </label>
                    <select
                      value={manualData.document_type}
                      onChange={(e) => handleManualInputChange('document_type', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Driving License">Permis de conduire</option>
                      <option value="National ID">Identité nationale</option>
                      <option value="Passport">Passeport</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Numéro du document
                    </label>
                    <input
                      type="text"
                      value={manualData.document_number}
                      onChange={(e) => handleManualInputChange('document_number', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Numéro du document"
                    />
                  </div>
                </div>

                {/* Manual Image Upload Section - Full Width */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Image de la pièce d'identité du conducteur
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
                      const files = Array.from(e.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
                      if (files.length > 0) {
                        await handleManualImageUpload(files);
                      }
                    }}
                    onClick={() => !manualUploading && document.getElementById('manual-image-input').click()}
                  >
                    <input
                      id="manual-image-input"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          await handleManualImageUpload(files);
                        }
                      }}
                      disabled={manualUploading}
                    />
                    
                    {manualUploading ? (
                      <div className="py-4">
                        <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Téléversement...</p>
                      </div>
                    ) : manualUploadedImages.length > 0 ? (
                      <div>
                        <div className="relative w-24 h-24 mx-auto mb-3 rounded-lg overflow-hidden border border-green-200">
                          <img 
                            src={manualImagePreview || manualUploadedImages[0].url} 
                            alt="Identité du conducteur"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://via.placeholder.com/96?text=ID';
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {manualUploadedImages.length > 1
                              ? tr(`${manualUploadedImages.length} ID images uploaded`, `${manualUploadedImages.length} images d'identité téléversées`)
                              : tr('ID image uploaded', "Image d'identité téléversée")}
                          </span>
                        </div>
                        {manualUploadedImages.length > 1 && (
                          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {manualUploadedImages.map((image) => (
                              <button
                                key={image.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectPrimaryImage(image.id);
                                }}
                                className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white ${image.id === primaryImageId ? 'border-blue-500 ring-2 ring-blue-200' : 'border-green-200'}`}
                              >
                                <img
                                  src={image.url}
                                  alt={image.name || 'ID'}
                                  className="h-full w-full object-cover"
                                />
                                {image.id === primaryImageId && (
                                  <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 px-1 py-0.5 text-[10px] font-semibold text-white">
                                    {tr('Primary', 'Principale')}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeManualUploadedImage(image.id);
                                  }}
                                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              document.getElementById('manual-image-input')?.click();
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {tr('Add More Photos', 'Ajouter plus de photos')}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManualUploadedImages([]);
                              setManualImagePreview(null);
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            {tr('Remove all photos', 'Supprimer toutes les photos')}
                          </button>
                        </div>
                        {manualUploadedImages.length > 1 && (
                          <p className="mt-2 text-xs text-slate-500">
                            {tr('Tap any thumbnail to choose the primary image. All photos stay attached to this driver.', 'Touchez une miniature pour choisir l’image principale. Toutes les photos restent jointes à ce conducteur.')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-gray-700 text-sm font-medium mb-1">{tr("Upload the driver's ID photos", "Téléverser les photos d'identité")}</p>
                        <p className="text-gray-500 text-xs">{tr('Click or drag multiple images here', 'Cliquez ou glissez plusieurs images ici')}</p>
                        <p className="text-xs text-gray-400 mt-2">JPG, PNG jusqu'à 10 Mo</p>
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
                  ← Scanner l'identité à la place
                </button>
              </div>
                        </div>
          )}
        </div>

        {cameraModalOpen && (
          <div className="absolute inset-0 z-20 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{tr('Take Photo', 'Prendre une photo')}</h3>
                <p className="text-sm text-gray-500">
                  {tr('Capture multiple shots, then save them to this scan.', 'Capturez plusieurs prises, puis enregistrez-les dans ce scan.')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCameraCaptureModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="overflow-hidden rounded-2xl bg-black">
                {cameraStarting ? (
                  <div className="flex aspect-[4/3] items-center justify-center text-white">
                    <div className="text-center">
                      <Loader className="mx-auto mb-3 h-8 w-8 animate-spin" />
                      <p className="text-sm">{tr('Starting camera...', 'Démarrage de la caméra...')}</p>
                    </div>
                  </div>
                ) : cameraError ? (
                  <div className="flex aspect-[4/3] items-center justify-center p-6 text-center text-white">
                    <div>
                      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
                      <p className="text-sm">{cameraError}</p>
                    </div>
                  </div>
                ) : (
                  <video
                    ref={liveVideoRef}
                    className="aspect-[4/3] w-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                )}
                <canvas ref={liveCanvasRef} className="hidden" />
              </div>

              {capturedCameraPhotos.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {capturedCameraPhotos.length > 1
                        ? tr(`${capturedCameraPhotos.length} photos captured`, `${capturedCameraPhotos.length} photos capturées`)
                        : tr('1 photo captured', '1 photo capturée')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        capturedCameraPhotos.forEach((photo) => {
                          if (photo?.url) URL.revokeObjectURL(photo.url);
                        });
                        setCapturedCameraPhotos([]);
                      }}
                      className="text-xs font-medium text-red-500 hover:text-red-700"
                    >
                      {tr('Clear all', 'Tout effacer')}
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {capturedCameraPhotos.map((photo) => (
                      <div key={photo.id} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img src={photo.url} alt="Captured ID" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeCapturedCameraPhoto(photo.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={closeCameraCaptureModal}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={captureCameraPhoto}
                  disabled={cameraStarting || capturingPhoto}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {capturingPhoto
                    ? tr('Capturing...', 'Capture...')
                    : capturedCameraPhotos.length > 0
                      ? tr('Take Another Photo', 'Prendre une autre photo')
                      : tr('Take Photo', 'Prendre une photo')}
                </button>
                <button
                  type="button"
                  onClick={saveCapturedCameraPhotos}
                  disabled={!capturedCameraPhotos.length || manualUploading}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {manualUploading
                    ? tr('Saving...', 'Enregistrement...')
                    : capturedCameraPhotos.length > 1
                      ? tr('Save Photos', 'Enregistrer les photos')
                      : tr('Save Photo', 'Enregistrer la photo')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!scanOnlyMode && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 sm:p-6">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleAddDriver}
              disabled={!canSubmit}
              className="flex-1 py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Ajout...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Ajouter le conducteur
                </>
              )}
            </button>
          </div>
          
          {/* Info Note */}
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Database className="w-3 h-3" />
            <span>Enregistré dans rental_second_drivers (aucun profil client créé)</span>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SecondDriverIDScanModal;
