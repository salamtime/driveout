import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { UploadCloud, Eye, FileText, ScanLine, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import VerificationStatusBadge from './VerificationStatusBadge';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';
import VerificationService from '../../services/VerificationService';
import { useTranslation } from 'react-i18next';
import EnhancedUnifiedIDScanModal from '../customers/EnhancedUnifiedIDScanModal';
import { geminiVisionOCR } from '../../services/geminiVisionOcr';
import { needsImageConversion, processImage } from '../../utils/mediaProcessor';

const getPreviewKind = (request) => {
  const fileUrl = String(request?.file_url || '').toLowerCase();
  const fileName = String(request?.file_name || '').toLowerCase();
  const source = `${fileUrl} ${fileName}`;

  if (/\.(jpg|jpeg|png|webp|gif|avif)\b/.test(source)) return 'image';
  if (/\.pdf\b/.test(source)) return 'pdf';
  return 'file';
};

const getPreviewKindFromFile = (file) => {
  const mimeType = String(file?.type || '').toLowerCase();
  const fileName = String(file?.name || '').toLowerCase();
  const source = `${mimeType} ${fileName}`;

  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|heic|heif)\b/.test(source)) return 'image';
  if (mimeType === 'application/pdf' || /\.pdf\b/.test(source)) return 'pdf';
  return 'file';
};

const withUiTimeout = (promise, timeoutMs, errorMessage) => {
  let timeoutId = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  });
};

const VerificationUploadField = forwardRef(({
  entityType,
  entityId,
  ownerUserId,
  verificationType,
  request,
  requiresExpiry = false,
  disabled = false,
  onUploaded,
  enableScan = false,
  scanTitle = null,
  currentProfile = null,
  showStatusBadge = true,
  embedded = false,
  footerManagedReview = false,
  onStateChange = null,
}, ref) => {
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState(request?.expires_at?.slice(0, 10) || '');
  const [pendingReview, setPendingReview] = useState(null);
  const [optimisticPreview, setOptimisticPreview] = useState(null);
  const optimisticPreviewRef = useRef(null);
  const [pendingReviewPreview, setPendingReviewPreview] = useState(null);
  const pendingReviewPreviewRef = useRef(null);
  const previewKind = getPreviewKind(request);
  const normalizedRequestStatus = String(request?.status || '').toLowerCase();
  const isBusy = isUploading || isSubmittingReview;
  const isReplacementRequested = normalizedRequestStatus === 'rejected';
  const canRemoveRequest = Boolean(request?.id);
  const latestReplacementNote = ['rejected', 'suspended'].includes(normalizedRequestStatus)
    ? String(request?.latest_replacement_note || request?.rejection_reason || '').trim()
    : '';
  const activePreview = pendingReviewPreview || optimisticPreview || (
    request?.file_url
      ? {
          url: request.file_url,
          name: request?.file_name || getVerificationTypeLabel(verificationType, language),
          kind: previewKind,
        }
      : null
  );
  const effectiveStatus = optimisticPreview ? 'pending' : (request?.status || 'missing');
  const displayedFileName =
    pendingReviewPreview?.name ||
    optimisticPreview?.name ||
    request?.file_name ||
    tr('No document uploaded yet.', 'Aucun document téléversé.');
  const displayedSourceLabel = optimisticPreview
    ? tr('Just uploaded', 'Téléversé à l’instant')
    : '';
  const hasPendingReview = Boolean(pendingReview?.file);
  const hasDocument = Boolean(activePreview?.url || hasPendingReview || request?.id);
  const canUploadNewDocument = !hasDocument && !disabled && !isBusy;

  const releasePreview = (preview) => {
    if (preview?.revokeOnDispose && preview?.url) {
      window.URL.revokeObjectURL(preview.url);
    }
  };

  const clearOptimisticPreview = () => {
    setOptimisticPreview((current) => {
      releasePreview(current);
      optimisticPreviewRef.current = null;
      return null;
    });
  };

  const clearPendingReviewPreview = () => {
    setPendingReviewPreview((current) => {
      releasePreview(current);
      pendingReviewPreviewRef.current = null;
      return null;
    });
  };

  const rememberUploadedPreview = (file) => {
    if (!file || typeof window === 'undefined' || !window.URL?.createObjectURL) {
      return;
    }

    const nextPreview = {
      url: window.URL.createObjectURL(file),
      name: file.name || getVerificationTypeLabel(verificationType, language),
      kind: getPreviewKindFromFile(file),
      revokeOnDispose: true,
    };

    setOptimisticPreview((current) => {
      releasePreview(current);
      optimisticPreviewRef.current = nextPreview;
      return nextPreview;
    });
  };

  const rememberPendingReviewPreview = (file) => {
    if (!file || typeof window === 'undefined' || !window.URL?.createObjectURL) {
      clearPendingReviewPreview();
      return;
    }

    const nextPreview = {
      url: window.URL.createObjectURL(file),
      name: file.name || getVerificationTypeLabel(verificationType, language),
      kind: getPreviewKindFromFile(file),
      revokeOnDispose: true,
    };

    setPendingReviewPreview((current) => {
      releasePreview(current);
      pendingReviewPreviewRef.current = nextPreview;
      return nextPreview;
    });
  };

  useEffect(() => {
    if (request?.file_url && optimisticPreviewRef.current) {
      clearOptimisticPreview();
    }
  }, [request?.file_url]);

  useEffect(() => {
    if (!pendingReview?.file) {
      clearPendingReviewPreview();
      return;
    }

    rememberPendingReviewPreview(pendingReview.file);
  }, [pendingReview]);

  useEffect(() => () => {
    releasePreview(optimisticPreviewRef.current);
    optimisticPreviewRef.current = null;
    releasePreview(pendingReviewPreviewRef.current);
    pendingReviewPreviewRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof onStateChange !== 'function') return;
    onStateChange({
      verificationType,
      hasPendingReview,
      hasDocument,
      isBusy,
      status: effectiveStatus,
      canUploadNewDocument,
    });
  }, [
    onStateChange,
    verificationType,
    hasPendingReview,
    hasDocument,
    isBusy,
    effectiveStatus,
    canUploadNewDocument,
  ]);

  const clearLocalDocument = () => {
    setPendingReview(null);
    clearPendingReviewPreview();
    clearOptimisticPreview();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDiscardDocument = async () => {
    if (disabled || isBusy || isRemoving) return;
    if (request?.id) {
      await handleRemove();
      return;
    }
    clearLocalDocument();
  };

  useImperativeHandle(ref, () => ({
    hasPendingReview: () => hasPendingReview,
    hasDocument: () => hasDocument,
    focus: () => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    openUpload: () => {
      inputRef.current?.click();
    },
    submitPendingReview: async () => {
      if (!hasPendingReview || isSubmittingReview) return false;
      await handleSubmitReviewedScan();
      return true;
    },
  }), [hasDocument, hasPendingReview, isSubmittingReview]);

  const mapScanFields = (scanData = {}) => ({
    full_name: scanData?.full_name || scanData?.fullName || scanData?.name || null,
    date_of_birth: scanData?.date_of_birth || scanData?.dateOfBirth || scanData?.customer_dob || null,
    document_number:
      scanData?.document_number ||
      scanData?.passport_number ||
      scanData?.id_number ||
      scanData?.idNumber ||
      scanData?.licence_number ||
      scanData?.license_number ||
      null,
    licence_number:
      scanData?.licence_number ||
      scanData?.license_number ||
      scanData?.document_number ||
      null,
    id_number: scanData?.id_number || scanData?.idNumber || null,
    nationality: scanData?.nationality || scanData?.country || null,
    issue_date: scanData?.issue_date || scanData?.issueDate || null,
    expiry_date: scanData?.expiry_date || scanData?.expiryDate || null,
  });

  const normalizeUploadFile = async (file) => {
    if (!file || !needsImageConversion(file)) {
      return file;
    }

    const { blob } = await processImage(file);
    const safeBaseName = String(file.name || 'document')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'document';

    return new File([blob], `${safeBaseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  };

  const getReviewFieldConfig = () => {
    const identityFields = [
      { key: 'full_name', label: tr('Full name', 'Nom complet'), type: 'text' },
      { key: 'document_number', label: tr('Document number', 'Numéro du document'), type: 'text' },
      { key: 'date_of_birth', label: tr('Date of birth', 'Date de naissance'), type: 'date' },
      { key: 'nationality', label: tr('Nationality', 'Nationalité'), type: 'text' },
    ];

    if (verificationType === 'driver_license') {
      return [
        { key: 'full_name', label: tr('Full name', 'Nom complet'), type: 'text' },
        { key: 'date_of_birth', label: tr('Date of birth', 'Date de naissance'), type: 'date' },
        { key: 'nationality', label: tr('Nationality', 'Nationalité'), type: 'text' },
        { key: 'licence_number', label: tr('License number', 'Numéro du permis'), type: 'text' },
        { key: 'expiry_date', label: tr('Expiry date', 'Date d’expiration'), type: 'date' },
      ];
    }

    return [
      ...identityFields,
      { key: 'issue_date', label: tr('Issue date', 'Date d’émission'), type: 'date' },
    ];
  };

  const beginReview = ({ file, submissionSource, scanData, extractedFields }) => {
    setPendingReview({
      file,
      submissionSource,
      scanData: scanData || {},
      fields: extractedFields || {},
    });
  };

  const finalizeSubmission = async ({
    file,
    submissionSource,
    scanData = null,
    extractedFields = {},
    ocrAttempted = false,
    ocrSucceeded = false,
    ocrError = null,
  }) => {
    const result = await uploadVerification(file, {
      submissionSource,
      ocrAttempted,
      ocrSucceeded,
      ocrError,
      extractedFields,
      customerReviewedFields: extractedFields,
    });

    if (ocrSucceeded && scanData) {
      void VerificationService.updateProfileFromVerificationScan({
        currentProfile,
        scanData: {
          ...scanData,
          ...extractedFields,
        },
      }).catch(() => null);
    }

    return result;
  };

  const shouldRunOcrForFile = (file) => {
    const mimeType = String(file?.type || '').toLowerCase();
    return mimeType.startsWith('image/');
  };

  const runUploadOcr = async (file) => {
    if (!shouldRunOcrForFile(file)) {
      return {
        ocrAttempted: false,
        ocrSucceeded: false,
        scanData: null,
        extractedFields: {},
      };
    }

    try {
      // Verification only needs OCR extraction. It should not try to create or
      // update a customer record just because the scanned document matches an
      // existing ID/licence already stored elsewhere.
      const ocrResult = await geminiVisionOCR.processIdDocument(file, null);
      const scanData = ocrResult?.data && typeof ocrResult.data === 'object' ? ocrResult.data : null;
      const extractedFields = mapScanFields(scanData || {});

      return {
        ocrAttempted: true,
        ocrSucceeded: Boolean(ocrResult?.success && scanData),
        scanData,
        extractedFields,
        rawOcrResult: ocrResult || null,
      };
    } catch (error) {
      return {
        ocrAttempted: true,
        ocrSucceeded: false,
        scanData: null,
        extractedFields: {},
        ocrError: error?.message || 'OCR unavailable',
      };
    }
  };

  const uploadVerification = async (file, metadata = {}) => {
    const result = await VerificationService.uploadVerificationDocument({
      entityType,
      entityId,
      ownerUserId,
      verificationType,
      file,
      expiresAt: expiresAt || null,
      notes: metadata,
    });
    if (typeof onUploaded === 'function') {
      Promise.resolve(onUploaded({ silent: true, forceRefresh: true, uploadResult: result })).catch(() => null);
    }
    return result;
  };

  const submitFile = async (file, submissionSource = 'manual_upload') => {
    if (!file || disabled || isBusy) return;

    if (requiresExpiry && !expiresAt) {
      toast.error(tr('Add the expiry date before uploading.', 'Ajoutez la date d’expiration avant le téléversement.'));
      return;
    }

    try {
      setIsUploading(true);
      const normalizedFile = await normalizeUploadFile(file);
      const ocrPayload = await runUploadOcr(normalizedFile);
      if (ocrPayload.ocrSucceeded && ocrPayload.scanData) {
        beginReview({
          file: normalizedFile,
          submissionSource,
          scanData: ocrPayload.scanData,
          extractedFields: ocrPayload.extractedFields,
        });
        toast.success(
          tr(
            'Review the scanned details before submitting.',
            'Vérifiez les détails scannés avant de soumettre.'
          )
        );
      } else if (ocrPayload.ocrAttempted) {
        await finalizeSubmission({
          file: normalizedFile,
          submissionSource,
          ocrAttempted: true,
          ocrSucceeded: false,
          ocrError: ocrPayload.ocrError || null,
          extractedFields: ocrPayload.extractedFields,
        });
        rememberUploadedPreview(normalizedFile);
        toast.success(
          tr(
            'Document submitted. Scan could not complete, so it was saved for manual review.',
            'Document envoyé. Le scan n’a pas abouti, il a été conservé pour vérification manuelle.'
          )
        );
      } else {
        await finalizeSubmission({
          file: normalizedFile,
          submissionSource,
          ocrAttempted: false,
          ocrSucceeded: false,
          extractedFields: ocrPayload.extractedFields,
        });
        rememberUploadedPreview(normalizedFile);
        toast.success(tr('Document submitted for review.', 'Document envoyé pour vérification.'));
      }
    } catch (error) {
      toast.error(error.message || tr('Unable to upload document.', 'Impossible de téléverser le document.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await submitFile(file, 'manual_upload');
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || isBusy) return;
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragActive(false);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (disabled || isBusy) return;
    const file = event.dataTransfer?.files?.[0];
    await submitFile(file, 'drag_drop_upload');
  };

  const handleScanComplete = async (scanData, scannedFile) => {
    if (!scannedFile || disabled || isBusy) return;

    try {
      beginReview({
        file: scannedFile,
        submissionSource: 'ocr_scan',
        scanData,
        extractedFields: mapScanFields(scanData),
      });
      toast.success(
        tr(
          'Review the scanned details before submitting.',
          'Vérifiez les détails scannés avant de soumettre.'
        )
      );
      setScanOpen(false);
    } catch (error) {
      toast.error(error.message || tr('Unable to submit scanned document.', 'Impossible de soumettre le document scanné.'));
    }
  };

  const handleRemove = async () => {
    if (!request?.id || disabled || isRemoving || isSubmittingReview) return;

    const confirmMessage =
      normalizedRequestStatus === 'approved'
        ? tr(
            'Delete this verified document? You will need to upload it again to stay verified.',
            'Supprimer ce document vérifié ? Vous devrez le téléverser à nouveau pour rester vérifié.'
          )
        : isReplacementRequested
          ? tr(
              'Delete this document request? The replacement request history will stay in messages.',
              'Supprimer cette demande de document ? L’historique de remplacement restera visible dans les messages.'
            )
          : tr(
              'Delete this document?',
              'Supprimer ce document ?'
            );

    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }

    try {
      setIsRemoving(true);
      await VerificationService.deleteVerificationRequest({ id: request.id });
      clearOptimisticPreview();
      setPendingReview(null);
      clearPendingReviewPreview();
      toast.success(tr('Document removed.', 'Document supprimé.'));
      onUploaded?.();
    } catch (error) {
      toast.error(error.message || tr('Unable to remove document.', 'Impossible de supprimer le document.'));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReviewFieldChange = (fieldKey, value) => {
    setPendingReview((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: {
          ...current.fields,
          [fieldKey]: value,
        },
      };
    });
  };

  const handleSubmitReviewedScan = async () => {
    if (!pendingReview?.file) return;

    try {
      setIsSubmittingReview(true);
      await withUiTimeout(
        finalizeSubmission({
          file: pendingReview.file,
          submissionSource: pendingReview.submissionSource,
          scanData: pendingReview.scanData,
          extractedFields: pendingReview.fields,
          ocrAttempted: true,
          ocrSucceeded: true,
        }),
        22000,
        tr(
          'Submitting took too long. Please refresh and check admin verification before trying again.',
          'L’envoi prend trop de temps. Actualisez et vérifiez la vérification admin avant de réessayer.'
        )
      );
      rememberUploadedPreview(pendingReview.file);
      toast.success(
        tr(
          'Scanned document submitted for review.',
          'Document scanné envoyé pour vérification.'
        )
      );
      setPendingReview(null);
      clearPendingReviewPreview();
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('too long')) {
        setPendingReview(null);
        clearPendingReviewPreview();
        if (typeof onUploaded === 'function') {
          Promise.resolve(onUploaded({ silent: false, forceRefresh: true })).catch(() => null);
        }
      }
      toast.error(error.message || tr('Unable to submit scanned document.', 'Impossible de soumettre le document scanné.'));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <>
    <div
      ref={containerRef}
      className={`w-full overflow-hidden rounded-[24px] ${
        embedded
          ? 'bg-transparent p-0 shadow-none'
          : `border bg-white p-4 shadow-sm transition hover:border-violet-100 hover:shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${
              dragActive
                ? 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-100'
                : 'border-slate-200'
            }`
      }`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          {activePreview?.url ? (
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border border-slate-200 bg-slate-50">
              {activePreview.kind === 'image' ? (
                <img
                  src={activePreview.url}
                  alt={activePreview.name || getVerificationTypeLabel(verificationType, language)}
                  className="h-full w-full object-cover"
                />
              ) : activePreview.kind === 'pdf' ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-2 text-center">
                  <FileText className="h-5 w-5 text-slate-600" />
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">PDF</span>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-2 text-center">
                  <FileText className="h-5 w-5 text-slate-600" />
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {tr('File', 'Fichier')}
                  </span>
                </div>
              )}
              <button
                type="button"
                disabled={disabled || isBusy || isRemoving}
                onClick={() => void handleDiscardDocument()}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/95 text-slate-500 shadow-sm transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={tr('Remove document', 'Supprimer le document')}
              >
                {isRemoving ? <Trash2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <FileText className="h-4 w-4" />
            </span>
            <p className="min-w-0 break-words text-sm font-bold text-slate-950">{getVerificationTypeLabel(verificationType, language)}</p>
            {showStatusBadge ? <VerificationStatusBadge status={effectiveStatus} /> : null}
          </div>
          <p className="mt-1 break-words text-xs font-medium text-slate-500 sm:truncate">
            {displayedFileName}
          </p>
          {displayedSourceLabel ? (
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {displayedSourceLabel}
            </p>
          ) : null}
          {!request?.file_url && optimisticPreview ? (
            <p className="mt-2 text-xs font-semibold text-emerald-600">
              {tr('Saved. Waiting for review.', 'Enregistré. En attente de vérification.')}
            </p>
          ) : null}
          {latestReplacementNote && (
            <p className="mt-2 text-xs font-semibold text-rose-600">{latestReplacementNote}</p>
          )}
        </div>
        </div>
        {isReplacementRequested ? (
          <div className="w-full rounded-[20px] border border-rose-200 bg-rose-50 px-3 py-3 text-left sm:w-auto sm:max-w-[18rem]">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-600">
              {tr('Replacement requested', 'Remplacement demandé')}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-rose-700">
              {latestReplacementNote || tr('Please scan or upload a clearer replacement document.', 'Veuillez scanner ou téléverser un document de remplacement plus clair.')}
            </p>
            {request?.latest_replacement_note_at ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">
                {tr('Latest admin note', 'Dernière note admin')}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {activePreview?.url && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Eye className="mr-1 inline h-3.5 w-3.5" />
              {tr('View', 'Voir')}
            </button>
          )}
          {enableScan && !hasDocument ? (
            <button
              type="button"
              disabled={disabled || isBusy}
              onClick={() => setScanOpen(true)}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanLine className="mr-1 inline h-3.5 w-3.5" />
              {isReplacementRequested ? tr('Scan replacement', 'Scanner le remplacement') : tr('Scan', 'Scanner')}
            </button>
          ) : null}
          {hasDocument ? (
            <span className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs font-bold text-emerald-700">
              {pendingReview ? tr('Ready to review', 'Prêt à vérifier') : tr('Uploaded', 'Téléversé')}
            </span>
          ) : (
            <button
              type="button"
              disabled={disabled || isBusy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl bg-violet-700 px-4 py-2 text-center text-xs font-bold text-white shadow-[0_12px_28px_rgba(109,40,217,0.18)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="mr-1 inline h-3.5 w-3.5" />
              {isUploading
                ? tr('Uploading...', 'Téléversement...')
                : isReplacementRequested
                  ? tr('Upload replacement', 'Téléverser le remplacement')
                  : tr('Upload', 'Téléverser')}
            </button>
          )}
        </div>
      </div>
      {!activePreview?.url ? (
        <p className={`mt-3 text-xs font-medium ${dragActive ? 'text-violet-700' : 'text-slate-500'}`}>
          {tr(
            'Click upload or drag and drop a document here.',
            'Cliquez sur téléverser ou glissez-déposez un document ici.'
          )}
        </p>
      ) : null}
      {pendingReview ? (
        <div className="mt-4 rounded-[22px] bg-violet-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                {tr('Check details', 'Vérifiez les détails')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {tr(
                  'Confirm the fields, then submit.',
                  'Confirmez les champs, puis envoyez.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            {pendingReviewPreview ? (
              <div className="rounded-[22px] bg-white/85 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {tr('Document preview', 'Aperçu du document')}
                </p>
                <div className="mt-3 flex h-52 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
                  {pendingReviewPreview.kind === 'image' ? (
                    <img
                      src={pendingReviewPreview.url}
                      alt={pendingReviewPreview.name || getVerificationTypeLabel(verificationType, language)}
                      className="h-full w-full object-cover"
                    />
                  ) : pendingReviewPreview.kind === 'pdf' ? (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-4 text-center">
                      <FileText className="h-7 w-7 text-slate-600" />
                      <span className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">PDF</span>
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-4 text-center">
                      <FileText className="h-7 w-7 text-slate-600" />
                      <span className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        {tr('File preview', 'Aperçu du fichier')}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="mt-3 inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  <Eye className="mr-1 inline h-3.5 w-3.5" />
                  {tr('Open larger preview', 'Ouvrir un aperçu plus grand')}
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {getReviewFieldConfig().map((field) => (
                <label key={field.key} className="block">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    {field.label}
                  </span>
                  <input
                    type={field.type}
                    value={pendingReview.fields?.[field.key] || ''}
                    onChange={(event) => handleReviewFieldChange(field.key, event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-white bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {footerManagedReview ? (
              <p className="text-xs font-semibold text-violet-700">
                {tr('Use the footer button below to submit this document for review.', 'Utilisez le bouton fixe ci-dessous pour envoyer ce document en vérification.')}
              </p>
            ) : (
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={handleSubmitReviewedScan}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white shadow-[0_12px_28px_rgba(109,40,217,0.18)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingReview ? tr('Submitting...', 'Envoi...') : tr('Submit for review', 'Envoyer pour vérification')}
              </button>
            )}
            <button
              type="button"
              disabled={isSubmittingReview}
              onClick={() => {
                setPendingReview(null);
                clearPendingReviewPreview();
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tr('Cancel', 'Annuler')}
            </button>
          </div>
        </div>
      ) : null}
      {requiresExpiry && (
        <div className="mt-3">
          <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {tr('Insurance expiry', 'Expiration assurance')}
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
          />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
    {enableScan ? (
      <EnhancedUnifiedIDScanModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanComplete={handleScanComplete}
        title={scanTitle}
        autoProcessOnSelect
        allowSaveWithoutOcr={false}
        skipCustomerSave
        verifiedIdentity={{
          fullName: currentProfile?.full_name || currentProfile?.fullName || '',
          email: currentProfile?.email || '',
          phone: currentProfile?.phone || currentProfile?.phone_number || '',
        }}
      />
    ) : null}
    {previewOpen && activePreview?.url ? (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"
        onClick={() => setPreviewOpen(false)}
      >
        <div
          className="relative flex max-h-[min(92vh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-slate-950">
                {getVerificationTypeLabel(verificationType, language)}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                {activePreview?.name || tr('Submitted document', 'Document soumis')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
              aria-label={tr('Close preview', 'Fermer l’aperçu')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden bg-slate-100 p-3 sm:p-4">
            {activePreview.kind === 'image' ? (
              <div className="flex h-full items-center justify-center overflow-auto rounded-[24px] bg-white p-3">
                <img
                  src={activePreview.url}
                  alt={activePreview?.name || getVerificationTypeLabel(verificationType, language)}
                  className="max-h-full w-auto max-w-full rounded-2xl object-contain"
                />
              </div>
            ) : activePreview.kind === 'pdf' ? (
              <iframe
                src={activePreview.url}
                title={activePreview?.name || getVerificationTypeLabel(verificationType, language)}
                className="h-[min(78vh,48rem)] w-full rounded-[24px] border border-slate-200 bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-500">
                {tr('Preview not available for this file type.', 'Aucun aperçu disponible pour ce type de fichier.')}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
});

export default VerificationUploadField;
