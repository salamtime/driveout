import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';
import i18n from '../i18n';
import { uploadFile } from '../utils/storageUpload';
import VerificationService from '../services/VerificationService';
import geminiVisionOCR from '../services/geminiVisionOcr';

const ALL_DOCUMENT_CATEGORIES = [
  { value: 'legal', label: 'Legal file', labelFr: 'Document légal' },
  { value: 'purchase-invoice', label: 'Purchase invoice', labelFr: "Facture d'achat" },
  { value: 'registration', label: 'Registration', labelFr: 'Immatriculation' },
  { value: 'annual-tax', label: 'Annual vehicle tax receipt', labelFr: 'Reçu de taxe annuelle véhicule' },
  { value: 'insurance', label: 'Insurance', labelFr: 'Assurance' },
  { value: 'maintenance', label: 'Maintenance', labelFr: 'Maintenance' },
  { value: 'other', label: 'Other', labelFr: 'Autre' },
];

const runWithTimeout = (promise, timeoutMs, errorMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);

const uploadWithRetry = async (bucketName, pathPrefix, fileName, file, retries = 2) => {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await runWithTimeout(
        uploadFile(file, {
          bucket: bucketName,
          pathPrefix,
          fileName,
          optimizationProfile: 'document',
        }),
        45000,
        'Upload stalled. Please try again.'
      );

      if (!result?.success) {
        throw new Error(result?.error || 'Upload failed');
      }

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 800 * attempt));
      }
    }
  }

  throw lastError || new Error('Upload failed');
};

const buildTemporaryDocument = ({ fileId, file, category, categoryKey, vehicleId }) => {
  const objectUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : '';
  return {
    id: `temp-${fileId}`,
    name: file.name,
    type: file.type,
    size: file.size,
    url: objectUrl,
    storagePath: '',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Current User',
    category,
    categoryKey,
    vehicleId,
    status: 'pending',
    isTemporary: true,
    objectUrl,
  };
};

const mergeDocumentList = (currentDocuments = [], nextDocuments = []) => {
  const merged = [];
  const seen = new Set();
  const seenIds = new Set();

  [...(Array.isArray(nextDocuments) ? nextDocuments : []), ...(Array.isArray(currentDocuments) ? currentDocuments : [])]
    .filter(Boolean)
    .forEach((document) => {
      const source = String(document?.source || '').trim().toLowerCase();
      const categoryKey = String(document?.categoryKey || '').trim().toLowerCase();
      const documentId = String(document?.id || '').trim();
      const key =
        source === 'verification' && categoryKey
          ? `verification:${categoryKey}`
          : document?.storagePath || document?.url || document?.id || `${categoryKey}:${document?.name || ''}`;

      if (!key || seen.has(key) || (documentId && seenIds.has(documentId))) return;
      seen.add(key);
      if (documentId) seenIds.add(documentId);
      merged.push(document);
    });

  return merged;
};

const replaceDocumentInList = (currentDocuments = [], temporaryId, finalDocument) => {
  const withoutTemporary = (Array.isArray(currentDocuments) ? currentDocuments : []).filter(
    (document) => document?.id !== temporaryId
  );
  return mergeDocumentList(withoutTemporary, finalDocument ? [finalDocument] : []);
};

const resolveVehicleLegalCategoryFromOcr = (selectedCategory, extractedData = null) => {
  const normalizedSelectedCategory = String(selectedCategory || '').trim().toLowerCase();
  const normalizedDocumentType = String(extractedData?.document_type || '').trim().toLowerCase();

  if (normalizedDocumentType === 'registration' || normalizedDocumentType === 'insurance') {
    return normalizedDocumentType;
  }

  const registrationSignalCount = [
    extractedData?.registration_number,
    extractedData?.registration_date,
    extractedData?.registration_expiry_date,
  ].filter((value) => String(value || '').trim()).length;

  const insuranceSignalCount = [
    extractedData?.insurance_policy_number,
    extractedData?.insurance_provider,
    extractedData?.insurance_expiry_date,
  ].filter((value) => String(value || '').trim()).length;

  if (registrationSignalCount > insuranceSignalCount) return 'registration';
  if (insuranceSignalCount > registrationSignalCount) return 'insurance';
  return normalizedSelectedCategory || 'registration';
};

const getNextSequentialLegalCategory = (currentCategory, categories = []) => {
  const normalizedCurrentCategory = String(currentCategory || '').trim().toLowerCase();
  const available = Array.isArray(categories)
    ? categories.map((category) => String(category?.value || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (normalizedCurrentCategory === 'registration' && available.includes('insurance')) {
    return 'insurance';
  }

  if (normalizedCurrentCategory === 'insurance' && available.includes('registration')) {
    return 'registration';
  }

  return available.find((value) => value !== normalizedCurrentCategory) || normalizedCurrentCategory || available[0] || 'registration';
};

const getProcessingProgressValue = (progressState) => {
  const status = String(progressState?.status || '').trim().toLowerCase();
  const rawProgress = Number(progressState?.progress);
  const normalizedProgress = Number.isFinite(rawProgress) ? rawProgress : 0;

  if (status === 'uploading') return Math.max(8, Math.min(42, normalizedProgress || 8));
  if (status === 'scanning') return Math.max(52, Math.min(78, normalizedProgress || 62));
  if (status === 'saving') return Math.max(82, Math.min(96, normalizedProgress || 88));
  if (status === 'completed') return 100;
  if (status === 'error') return 100;
  return 0;
};

const DocumentUpload = ({
  vehicleId,
  verificationEntityId = null,
  ownerUserId = null,
  documents = [],
  onDocumentsChange,
  onUploadComplete,
  onOcrExtracted,
  onProcessingStateChange,
  allowedCategoryValues = null,
  defaultCategory = null,
  lockedCategory = null,
  disabled = false,
  className = '',
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const DOCUMENT_CATEGORIES = useMemo(() => {
    const allowedSet = Array.isArray(allowedCategoryValues) && allowedCategoryValues.length > 0
      ? new Set(allowedCategoryValues.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
      : null;

    return ALL_DOCUMENT_CATEGORIES
      .filter((category) => !allowedSet || allowedSet.has(category.value))
      .map((category) => ({
        value: category.value,
        label: tr(category.label, category.labelFr),
      }));
  }, [allowedCategoryValues, isFrench]);

  const resolvedDefaultCategory =
    (lockedCategory && DOCUMENT_CATEGORIES.some((category) => category.value === lockedCategory) && lockedCategory) ||
    (defaultCategory && DOCUMENT_CATEGORIES.some((category) => category.value === defaultCategory) && defaultCategory) ||
    DOCUMENT_CATEGORIES[0]?.value ||
    'legal';

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [temporaryDocuments, setTemporaryDocuments] = useState([]);
  const [error, setError] = useState(null);
  const [documentCategory, setDocumentCategory] = useState(resolvedDefaultCategory);
  const [queuedUpload, setQueuedUpload] = useState(null);
  const fileInputRef = useRef(null);
  const temporaryDocumentsRef = useRef([]);
  const BUCKET_NAME = 'vehicle-documents';

  const VERIFICATION_TYPE_BY_CATEGORY = {
    registration: 'vehicle_registration',
    insurance: 'vehicle_insurance',
  };

  useEffect(() => {
    if (lockedCategory && lockedCategory !== documentCategory) {
      setDocumentCategory(lockedCategory);
      return;
    }
    if (!DOCUMENT_CATEGORIES.some((category) => category.value === documentCategory)) {
      setDocumentCategory(resolvedDefaultCategory);
    }
  }, [DOCUMENT_CATEGORIES, documentCategory, lockedCategory, resolvedDefaultCategory]);

  useEffect(() => {
    temporaryDocumentsRef.current = temporaryDocuments;
  }, [temporaryDocuments]);

  useEffect(() => () => {
    temporaryDocumentsRef.current.forEach((document) => {
      if (document?.objectUrl) {
        URL.revokeObjectURL(document.objectUrl);
      }
    });
  }, []);

  useEffect(() => {
    if (uploading || !queuedUpload) return undefined;

    const nextQueuedUpload = queuedUpload;
    setQueuedUpload(null);
    void uploadFiles([nextQueuedUpload.file], nextQueuedUpload.category);
    return undefined;
  }, [queuedUpload, uploading]);

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []).slice(0, 1);
    if (files.length > 0) {
      queueOrUploadFiles(files);
    }
  };

  const uploadFiles = async (files, categoryOverride = null) => {
    if (!vehicleId) {
      setError(tr('Vehicle ID is required for document upload', "L'identifiant du véhicule est requis pour téléverser un document"));
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress({});

    const newDocuments = [];
    try {
      for (const file of files) {
        const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const selectedCategory = String(categoryOverride || documentCategory || resolvedDefaultCategory || 'legal').trim().toLowerCase();
        const categoryLabel = DOCUMENT_CATEGORIES.find((category) => category.value === selectedCategory)?.label || file.type || 'Document';
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storedFileName = `${selectedCategory}__${fileId}_${safeFileName}`;
        const pathPrefix = `${vehicleId}`;
        const nextCategory = getNextSequentialLegalCategory(selectedCategory, DOCUMENT_CATEGORIES);

        let progressTimer = null;

        try {
          setDocumentCategory(nextCategory);
          setUploadProgress((prev) => ({
            ...prev,
            [fileId]: {
              category: selectedCategory,
              categoryLabel,
              progress: 10,
              status: 'uploading',
              updatedAt: Date.now(),
            },
          }));
 
          progressTimer = window.setInterval(() => {
            setUploadProgress((prev) => {
              const current = prev[fileId];
              if (!current || current.status !== 'uploading') {
                window.clearInterval(progressTimer);
                return prev;
              }

              return {
                ...prev,
                [fileId]: {
                  ...current,
                  progress: Math.min(38, (Number(current.progress) || 0) + 6),
                  updatedAt: Date.now(),
                },
              };
            });
          }, 400);

          const initialVerificationType = VERIFICATION_TYPE_BY_CATEGORY[selectedCategory] || null;
          const shouldQueueVerification =
            initialVerificationType &&
            verificationEntityId &&
            !String(vehicleId).startsWith('owner-draft-');
          const shouldRunVehicleOcr = ['registration', 'insurance'].includes(selectedCategory);

          let documentObj = null;

          if (shouldQueueVerification) {
            if (progressTimer) window.clearInterval(progressTimer);

            const temporaryDocument = buildTemporaryDocument({
              fileId,
              file,
              category: categoryLabel,
              categoryKey: selectedCategory,
              vehicleId,
            });

            setTemporaryDocuments((current) => [...current, temporaryDocument]);
            onDocumentsChange?.(mergeDocumentList(documents, [temporaryDocument]));

            setUploadProgress((prev) => {
              return {
                ...prev,
                [fileId]: {
                  ...(prev[fileId] || {}),
                  progress: shouldRunVehicleOcr ? 58 : 90,
                  status: shouldRunVehicleOcr ? 'scanning' : 'uploading',
                  updatedAt: Date.now(),
                },
              };
            });

            let ocrResult = null;
            let resolvedCategory = selectedCategory;

            if (shouldRunVehicleOcr) {
              ocrResult = await runWithTimeout(
                geminiVisionOCR.processVehicleLegalDocument(file, selectedCategory),
                45000,
                tr('Document scan timed out. Please enter the fields manually.', 'Le scan du document a expiré. Veuillez saisir les champs manuellement.')
              );
              resolvedCategory = resolveVehicleLegalCategoryFromOcr(selectedCategory, ocrResult?.data);

              if (typeof onOcrExtracted === 'function') {
                await onOcrExtracted({
                  category: resolvedCategory,
                  file,
                  document: temporaryDocument,
                  extractedData: ocrResult?.data || null,
                  missingFields: ocrResult?.missingFields || [],
                  success: Boolean(ocrResult?.success),
                  error: ocrResult?.error || '',
                  persisted: false,
                  verificationRequestId: null,
                });
              }

              setUploadProgress((prev) => {
                return {
                  ...prev,
                  [fileId]: {
                    ...(prev[fileId] || {}),
                    progress: 86,
                    status: 'saving',
                    updatedAt: Date.now(),
                  },
                };
              });
            }

            const resolvedCategoryLabel =
              DOCUMENT_CATEGORIES.find((category) => category.value === resolvedCategory)?.label ||
              categoryLabel;
            const resolvedVerificationType = VERIFICATION_TYPE_BY_CATEGORY[resolvedCategory] || initialVerificationType;

            const verificationResult = await runWithTimeout(
              VerificationService.uploadVerificationDocument({
                entityType: 'vehicle',
                entityId: String(verificationEntityId),
                ownerUserId,
                verificationType: resolvedVerificationType,
                file,
              }),
              45000,
              tr('Document review save timed out. The scanned fields are still kept below.', 'L’enregistrement de revue a expiré. Les champs scannés restent conservés ci-dessous.')
            );

            const request = verificationResult?.request || {};
            documentObj = {
              id: request.id || fileId,
              name: request.file_name || file.name,
              type: request.file_mime_type || file.type,
              size: request.file_size || file.size,
              url: request.file_url || '',
              storagePath: request.file_path || '',
              uploadedAt: request.created_at || new Date().toISOString(),
              uploadedBy: 'Current User',
              category: resolvedCategoryLabel,
              categoryKey: resolvedCategory,
              vehicleId,
              status: request.status || 'pending',
              replacesDocumentId: temporaryDocument.id,
            };

            setTemporaryDocuments((current) => {
              current
                .filter((item) => item?.id === temporaryDocument.id && item?.objectUrl)
                .forEach((item) => URL.revokeObjectURL(item.objectUrl));
              return current.filter((item) => item?.id !== temporaryDocument.id);
            });
            onDocumentsChange?.(replaceDocumentInList(documents, temporaryDocument.id, documentObj));

            if (typeof onOcrExtracted === 'function') {
              await onOcrExtracted({
                category: resolvedCategory,
                file,
                document: documentObj,
                extractedData: ocrResult?.data || null,
                missingFields: ocrResult?.missingFields || [],
                success: Boolean(ocrResult?.success),
                error: ocrResult?.error || '',
                persisted: true,
                verificationRequestId: request.id || null,
              });
            }
          } else {
            let resolvedCategory = selectedCategory;
            const uploadResult = await uploadWithRetry(
              BUCKET_NAME,
              pathPrefix,
              storedFileName,
              file
            );

            if (progressTimer) window.clearInterval(progressTimer);

            if (shouldRunVehicleOcr) {
              setUploadProgress((prev) => {
                const current = prev[fileId];
                return {
                  ...prev,
                  [fileId]: {
                    ...current,
                    progress: 58,
                    status: 'scanning',
                    updatedAt: Date.now(),
                  },
                };
              });
              try {
                const ocrResult = await runWithTimeout(
                  geminiVisionOCR.processVehicleLegalDocument(file, selectedCategory),
                  45000,
                  tr('Document scan timed out. Please enter the fields manually.', 'Le scan du document a expiré. Veuillez saisir les champs manuellement.')
                );
                resolvedCategory = resolveVehicleLegalCategoryFromOcr(selectedCategory, ocrResult?.data);
              } catch (ocrCategoryError) {
                console.warn('Unable to resolve vehicle legal document category before local save:', ocrCategoryError);
              }
            }

            const resolvedCategoryLabel =
              DOCUMENT_CATEGORIES.find((category) => category.value === resolvedCategory)?.label ||
              categoryLabel;
            documentObj = {
              id: fileId,
              name: file.name,
              type: file.type,
              size: file.size,
              url: uploadResult.url,
              storagePath: uploadResult.path,
              uploadedAt: new Date().toISOString(),
              uploadedBy: 'Current User',
              category: resolvedCategoryLabel,
              categoryKey: resolvedCategory,
              vehicleId,
            };

            if (shouldRunVehicleOcr && typeof onOcrExtracted === 'function') {
              setUploadProgress((prev) => {
                const current = prev[fileId];
                return {
                  ...prev,
                  [fileId]: {
                    ...current,
                    progress: 86,
                    status: 'saving',
                    updatedAt: Date.now(),
                  },
                };
              });

              try {
                const ocrResult = await runWithTimeout(
                  geminiVisionOCR.processVehicleLegalDocument(file, resolvedCategory),
                  45000,
                  tr('Document scan timed out. Please enter the fields manually.', 'Le scan du document a expiré. Veuillez saisir les champs manuellement.')
                );

                await onOcrExtracted({
                  category: resolveVehicleLegalCategoryFromOcr(resolvedCategory, ocrResult?.data),
                  file,
                  document: documentObj,
                  extractedData: ocrResult?.data || null,
                  missingFields: ocrResult?.missingFields || [],
                  success: Boolean(ocrResult?.success),
                  error: ocrResult?.error || '',
                });

                setUploadProgress((prev) => {
                  const current = prev[fileId];
                  return {
                    ...prev,
                    [fileId]: {
                      ...current,
                      progress: 100,
                      status: ocrResult?.success ? 'completed' : 'error',
                      error: ocrResult?.success ? undefined : (ocrResult?.error || 'Scan failed'),
                      updatedAt: Date.now(),
                    },
                  };
                });
              } catch (ocrError) {
                await onOcrExtracted({
                  category: String(documentObj?.categoryKey || resolvedCategory || selectedCategory || '').trim().toLowerCase() || selectedCategory,
                  file,
                  document: documentObj,
                  extractedData: null,
                  missingFields: [],
                  success: false,
                  error: ocrError?.message || 'Scan failed',
                });

                setUploadProgress((prev) => {
                  const current = prev[fileId];
                  return {
                    ...prev,
                    [fileId]: {
                      ...current,
                      progress: 100,
                      status: 'error',
                      error: ocrError?.message || 'Processing failed',
                      updatedAt: Date.now(),
                    },
                  };
                });
              }
            }
          }

          newDocuments.push(documentObj);

          if (!shouldQueueVerification && !shouldRunVehicleOcr) {
            setUploadProgress((prev) => {
              return {
                ...prev,
                [fileId]: {
                  ...(prev[fileId] || {}),
                  progress: 100,
                  status: 'completed',
                  updatedAt: Date.now(),
                },
              };
            });
          }
        } catch (fileError) {
          if (progressTimer) window.clearInterval(progressTimer);
          if (shouldQueueVerification && typeof onOcrExtracted === 'function') {
            try {
              await onOcrExtracted({
                category: selectedCategory,
                file,
                document: null,
                extractedData: null,
                missingFields: [],
                success: false,
                error: fileError?.message || 'Upload failed',
                persisted: true,
                verificationRequestId: null,
              });
            } catch (callbackError) {
              console.error(`❌ OCR error-state callback failed for ${file.name}:`, callbackError);
            }
          }
          setTemporaryDocuments((current) => {
            current
              .filter((item) => item?.id === `temp-${fileId}` && item?.objectUrl)
              .forEach((item) => URL.revokeObjectURL(item.objectUrl));
            return current.filter((item) => item?.id !== `temp-${fileId}`);
          });
          setUploadProgress((prev) => {
            return {
              ...prev,
              [fileId]: {
                ...(prev[fileId] || {}),
                progress: 0,
                status: 'error',
                error: fileError.message,
                updatedAt: Date.now(),
              },
            };
          });
        }
      }

      if (newDocuments.length > 0) {
        const updatedDocuments = mergeDocumentList(documents, newDocuments);
        onDocumentsChange(updatedDocuments);
        onUploadComplete?.(updatedDocuments);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (uploadError) {
      setError(`${tr('Upload failed:', 'Échec du téléversement :')} ${uploadError.message}`);
    } finally {
      setUploading(false);
      window.setTimeout(() => {
        setUploadProgress((current) => {
          const nextEntries = Object.entries(current).filter(([, progress]) =>
            ['error'].includes(String(progress?.status || '').trim().toLowerCase())
          );
          return Object.fromEntries(nextEntries);
        });
      }, 2500);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files).slice(0, 1);
    if (files.length > 0) {
      queueOrUploadFiles(files);
    }
  };

  const queueOrUploadFiles = (files) => {
    if (disabled) return;

    const nextFile = Array.isArray(files) ? files[0] : null;
    if (!nextFile) return;

    if (uploading) {
      if (queuedUpload) {
        setError(
          tr(
            'One document is already queued. Wait for the current scan to finish first.',
            'Un document est déjà en attente. Attendez que le scan en cours se termine.'
          )
        );
        return;
      }

      const queuedCategory = String(documentCategory || resolvedDefaultCategory || 'registration').trim().toLowerCase();
      setQueuedUpload({
        file: nextFile,
        category: queuedCategory,
        name: nextFile.name,
      });
      setError(null);
      return;
    }

    void uploadFiles([nextFile], documentCategory);
  };

  const progressEntries = Object.entries(uploadProgress);
  const activeProgress = [...progressEntries]
    .sort(([, left], [, right]) => (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0))[0]?.[1] || null;
  const activeProcessing = Boolean(
    activeProgress &&
    !['completed', 'error'].includes(String(activeProgress?.status || '').trim().toLowerCase())
  );
  const activeCategoryLabel =
    activeProgress?.categoryLabel ||
    DOCUMENT_CATEGORIES.find((category) => category.value === documentCategory)?.label ||
    tr('Document', 'Document');
  const selectedCategoryLabel =
    DOCUMENT_CATEGORIES.find((category) => category.value === documentCategory)?.label ||
    activeCategoryLabel;
  const queuedCategoryLabel =
    queuedUpload?.category
      ? DOCUMENT_CATEGORIES.find((category) => category.value === queuedUpload.category)?.label || queuedUpload.category
      : '';
  const displayProgressValue = getProcessingProgressValue(activeProgress);
  const canAcceptAnotherFile = !disabled && (!uploading || !queuedUpload);

  useEffect(() => {
    if (typeof onProcessingStateChange !== 'function') return undefined;

    onProcessingStateChange({
      active: activeProcessing,
      queued: Boolean(queuedUpload),
      currentCategory: String(activeProgress?.category || '').trim().toLowerCase(),
      currentCategoryLabel: activeProgress?.categoryLabel || '',
      queuedCategory: String(queuedUpload?.category || '').trim().toLowerCase(),
      queuedCategoryLabel,
      status: String(activeProgress?.status || '').trim().toLowerCase(),
      progress: displayProgressValue,
    });

    return undefined;
  }, [
    activeProcessing,
    activeProgress?.category,
    activeProgress?.categoryLabel,
    activeProgress?.status,
    displayProgressValue,
    onProcessingStateChange,
    queuedCategoryLabel,
    queuedUpload,
  ]);

  useEffect(() => () => {
    if (typeof onProcessingStateChange !== 'function') return;
    onProcessingStateChange({
      active: false,
      queued: false,
      currentCategory: '',
      currentCategoryLabel: '',
      queuedCategory: '',
      queuedCategoryLabel: '',
      status: '',
      progress: 0,
    });
  }, [onProcessingStateChange]);
  const uploadStateMeta = activeProgress
    ? activeProgress.status === 'uploading'
      ? {
          title: tr('Uploading document...', 'Téléversement du document...'),
          body: tr('Your document is being uploaded securely.', 'Votre document est téléversé de manière sécurisée.'),
          tone: 'border-slate-200 bg-slate-50 text-slate-700',
        }
      : activeProgress.status === 'scanning'
        ? {
            title: tr('Scanning your document...', 'Scan de votre document...'),
            body: tr('We are reading the document details now.', 'Nous lisons maintenant les détails du document.'),
            tone: 'border-violet-200 bg-violet-50 text-violet-700',
          }
        : activeProgress.status === 'saving'
          ? {
              title: tr('Confirming your document...', 'Confirmation de votre document...'),
              body: tr('We are saving the scanned result and preparing the review.', 'Nous enregistrons le résultat du scan et préparons la revue.'),
              tone: 'border-violet-200 bg-violet-50 text-violet-700',
            }
          : activeProgress.status === 'completed'
            ? {
                title: tr('Document verified', 'Document vérifié'),
                body: tr('We’ve automatically confirmed the details.', 'Nous avons confirmé automatiquement les détails.'),
                tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
              }
            : {
                title: tr('Document not readable', 'Document illisible'),
                body: activeProgress.error || tr('Upload again or enter details manually below.', 'Téléversez à nouveau ou saisissez les détails manuellement ci-dessous.'),
                tone: 'border-amber-200 bg-amber-50 text-amber-800',
              }
    : null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        {tr('Final verification may take up to 24 hours.', 'La vérification finale peut prendre jusqu’à 24 heures.')}
      </div>

      {DOCUMENT_CATEGORIES.length > 1 ? (
        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {tr('Choose document type', 'Choisir le type de document')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DOCUMENT_CATEGORIES.map((category) => {
              const active = documentCategory === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  disabled={disabled || activeProcessing || Boolean(queuedUpload) || Boolean(lockedCategory)}
                  onClick={() => setDocumentCategory(category.value)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${
                    active
                      ? 'border-violet-300 bg-violet-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">
            {activeProcessing
              ? tr(
                  queuedUpload
                    ? 'Current scan is running. The queued file will upload next automatically.'
                    : 'Current scan is running. You can queue the highlighted next document now.',
                  queuedUpload
                    ? 'Le scan actuel est en cours. Le fichier en attente sera envoyé automatiquement ensuite.'
                    : 'Le scan actuel est en cours. Vous pouvez maintenant ajouter le document suivant mis en évidence.'
                )
              : tr('Pick the type first, then upload the matching photo.', 'Choisissez le type, puis téléversez la photo correspondante.')}
          </p>
        </div>
      ) : null}

      <div
        className={`rounded-[1.6rem] border-2 border-dashed p-6 text-center transition-colors ${
          !canAcceptAnotherFile
            ? 'cursor-not-allowed border-slate-200 bg-slate-50'
            : activeProcessing
              ? 'cursor-pointer border-violet-300 bg-violet-50/60 hover:border-violet-400'
              : 'cursor-pointer border-violet-200 bg-white hover:border-violet-400'
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => canAcceptAnotherFile && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={!canAcceptAnotherFile}
        />

        <div className="flex flex-col items-center gap-2">
          <Upload className={`w-8 h-8 ${canAcceptAnotherFile ? 'text-violet-500' : 'text-slate-400'}`} />
          <div>
            <p className={`text-base font-semibold ${canAcceptAnotherFile ? 'text-slate-900' : 'text-slate-400'}`}>
              {activeProcessing
                ? tr('Queue next document', 'Mettre le document suivant en attente')
                : tr('Upload your document', 'Téléversez votre document')}
            </p>
            <p className={`mt-1 text-sm ${canAcceptAnotherFile ? 'text-slate-500' : 'text-slate-300'}`}>
              {activeProcessing
                ? tr('[ Drop next photo ]', '[ Déposer la photo suivante ]')
                : tr('[ Upload photo ]', '[ Téléverser la photo ]')}
            </p>
          </div>
          <p className={`text-xs ${canAcceptAnotherFile ? 'text-slate-400' : 'text-slate-300'}`}>
            {activeProcessing ? selectedCategoryLabel : activeCategoryLabel}
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-red-800 font-medium">Upload Error</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      ) : null}

      {uploadStateMeta ? (
        <div className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${uploadStateMeta.tone}`}>
          <div className="flex items-start gap-3">
            {activeProgress?.status === 'completed' ? (
              <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm font-bold">{uploadStateMeta.title}</p>
              <p className="mt-1 text-sm">{uploadStateMeta.body}</p>
              {activeProgress?.status === 'error' ? (
                <p className="mt-3 text-sm font-medium">
                  {tr('Upload again or enter details manually below.', 'Téléversez à nouveau ou saisissez les détails manuellement ci-dessous.')}
                </p>
              ) : null}
              {activeProcessing ? (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-current transition-[width] duration-500 ease-out"
                      style={{ width: `${displayProgressValue}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em]">
                    <span>{activeCategoryLabel}</span>
                    <span>{displayProgressValue}%</span>
                  </div>
                </div>
              ) : null}
              {queuedUpload ? (
                <div className="mt-4 rounded-2xl border border-white/60 bg-white/60 px-3 py-3 text-xs font-medium">
                  <p className="font-semibold uppercase tracking-[0.16em]">
                    {tr('Queued next', 'En attente ensuite')}
                  </p>
                  <p className="mt-1">
                    {tr('We will scan this right after the current document:', 'Nous scannerons ce fichier juste après le document en cours :')}{' '}
                    <span className="font-bold">{queuedCategoryLabel || queuedUpload.name}</span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DocumentUpload;
