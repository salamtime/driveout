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

const DocumentUpload = ({
  vehicleId,
  verificationEntityId = null,
  ownerUserId = null,
  documents = [],
  onDocumentsChange,
  onUploadComplete,
  onOcrExtracted,
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

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []).slice(0, 1);
    if (files.length > 0) {
      void uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
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
        const selectedCategory = documentCategory;
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storedFileName = `${selectedCategory}__${fileId}_${safeFileName}`;
        const pathPrefix = `${vehicleId}`;

        let progressTimer = null;

        try {
          setUploadProgress((prev) => ({
            ...prev,
            [fileId]: { progress: 0, status: 'uploading', updatedAt: Date.now() },
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
                  progress: Math.min(90, (Number(current.progress) || 0) + 15),
                  updatedAt: Date.now(),
                },
              };
            });
          }, 400);

          const verificationType = VERIFICATION_TYPE_BY_CATEGORY[selectedCategory] || null;
          const shouldQueueVerification =
            verificationType &&
            verificationEntityId &&
            !String(vehicleId).startsWith('owner-draft-');
          const shouldRunVehicleOcr = ['registration', 'insurance'].includes(selectedCategory);
          const categoryLabel = DOCUMENT_CATEGORIES.find((category) => category.value === selectedCategory)?.label || file.type || 'Document';

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

            setUploadProgress((prev) => {
              return {
                ...prev,
                [fileId]: { progress: 100, status: shouldRunVehicleOcr ? 'scanning' : 'uploading', updatedAt: Date.now() },
              };
            });

            let ocrResult = null;

            if (shouldRunVehicleOcr) {
              ocrResult = await runWithTimeout(
                geminiVisionOCR.processVehicleLegalDocument(file, selectedCategory),
                45000,
                tr('Document scan timed out. Please enter the fields manually.', 'Le scan du document a expiré. Veuillez saisir les champs manuellement.')
              );

              if (typeof onOcrExtracted === 'function') {
                await onOcrExtracted({
                  category: selectedCategory,
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
                    progress: 100,
                    status: 'saving',
                    updatedAt: Date.now(),
                  },
                };
              });
            }

            const verificationResult = await VerificationService.uploadVerificationDocument({
              entityType: 'vehicle',
              entityId: String(verificationEntityId),
              ownerUserId,
              verificationType,
              file,
            });

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
              category: categoryLabel,
              categoryKey: selectedCategory,
              vehicleId,
              status: request.status || 'pending',
            };

            setTemporaryDocuments((current) => {
              current
                .filter((item) => item?.id === temporaryDocument.id && item?.objectUrl)
                .forEach((item) => URL.revokeObjectURL(item.objectUrl));
              return current.filter((item) => item?.id !== temporaryDocument.id);
            });

            if (typeof onOcrExtracted === 'function') {
              await onOcrExtracted({
                category: selectedCategory,
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
            const uploadResult = await uploadWithRetry(
              BUCKET_NAME,
              pathPrefix,
              storedFileName,
              file
            );

            if (progressTimer) window.clearInterval(progressTimer);

            documentObj = {
              id: fileId,
              name: file.name,
              type: file.type,
              size: file.size,
              url: uploadResult.url,
              storagePath: uploadResult.path,
              uploadedAt: new Date().toISOString(),
              uploadedBy: 'Current User',
              category: categoryLabel,
              categoryKey: selectedCategory,
              vehicleId,
            };
          }

          newDocuments.push(documentObj);

          setUploadProgress((prev) => {
            return {
              ...prev,
              [fileId]: { progress: 100, status: 'completed', updatedAt: Date.now() },
            };
          });
          if (!shouldQueueVerification && shouldRunVehicleOcr && typeof onOcrExtracted === 'function') {
            void (async () => {
              setUploadProgress((prev) => {
                return {
                  ...prev,
                  [fileId]: {
                    progress: 100,
                    status: shouldRunVehicleOcr ? 'scanning' : 'completed',
                    updatedAt: Date.now(),
                  },
                };
              });

              if (shouldRunVehicleOcr && typeof onOcrExtracted === 'function') {
                const ocrResult = await runWithTimeout(
                  geminiVisionOCR.processVehicleLegalDocument(file, selectedCategory),
                  45000,
                  tr('Document scan timed out. Please enter the fields manually.', 'Le scan du document a expiré. Veuillez saisir les champs manuellement.')
                );

                await onOcrExtracted({
                  category: selectedCategory,
                  file,
                  document: documentObj,
                  extractedData: ocrResult?.data || null,
                  missingFields: ocrResult?.missingFields || [],
                  success: Boolean(ocrResult?.success),
                  error: ocrResult?.error || '',
                });

                setUploadProgress((prev) => {
                  return {
                    ...prev,
                    [fileId]: {
                      progress: 100,
                      status: ocrResult?.success ? 'completed' : 'error',
                      error: ocrResult?.success ? undefined : (ocrResult?.error || 'Scan failed'),
                      updatedAt: Date.now(),
                    },
                  };
                });
                return;
              }

              setUploadProgress((prev) => {
                return {
                  ...prev,
                  [fileId]: { progress: 100, status: 'completed', updatedAt: Date.now() },
                };
              });
            })().catch(async (backgroundError) => {
              if (shouldRunVehicleOcr && typeof onOcrExtracted === 'function') {
                try {
                  await onOcrExtracted({
                    category: selectedCategory,
                    file,
                    document: documentObj,
                    extractedData: null,
                    missingFields: [],
                    success: false,
                    error: backgroundError?.message || 'Scan failed',
                  });
                } catch (callbackError) {
                  console.error(`❌ OCR fallback callback error for ${file.name}:`, callbackError);
                }
              }
 
              setUploadProgress((prev) => {
                return {
                  ...prev,
                  [fileId]: {
                    progress: 100,
                    status: 'error',
                    error: backgroundError?.message || 'Processing failed',
                    updatedAt: Date.now(),
                  },
                };
              });
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
        const updatedDocuments = [...documents, ...newDocuments];
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

    if (disabled || uploading) return;

    const files = Array.from(e.dataTransfer.files).slice(0, 1);
    if (files.length > 0) {
      void uploadFiles(files);
    }
  };

  const progressEntries = Object.entries(uploadProgress);
  const activeProgress = [...progressEntries]
    .sort(([, left], [, right]) => (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0))[0]?.[1] || null;
  const activeCategoryLabel =
    DOCUMENT_CATEGORIES.find((category) => category.value === documentCategory)?.label || tr('Document', 'Document');
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

      <div
        className={`rounded-[1.6rem] border-2 border-dashed p-6 text-center transition-colors ${
          disabled || uploading
            ? 'cursor-not-allowed border-slate-200 bg-slate-50'
            : 'cursor-pointer border-violet-200 bg-white hover:border-violet-400'
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />

        <div className="flex flex-col items-center gap-2">
          <Upload className={`w-8 h-8 ${disabled || uploading ? 'text-slate-400' : 'text-violet-500'}`} />
          <div>
            <p className={`text-base font-semibold ${disabled || uploading ? 'text-slate-400' : 'text-slate-900'}`}>
              {tr('Upload your document', 'Téléversez votre document')}
            </p>
            <p className={`mt-1 text-sm ${disabled || uploading ? 'text-slate-300' : 'text-slate-500'}`}>
              {tr('[ Upload photo ]', '[ Téléverser la photo ]')}
            </p>
          </div>
          <p className={`text-xs ${disabled || uploading ? 'text-slate-300' : 'text-slate-400'}`}>
            {activeCategoryLabel}
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DocumentUpload;
