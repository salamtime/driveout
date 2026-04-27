import React, { useRef, useState } from 'react';
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

const VerificationUploadField = ({
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
}) => {
  const inputRef = useRef(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState(request?.expires_at?.slice(0, 10) || '');
  const [pendingReview, setPendingReview] = useState(null);
  const previewKind = getPreviewKind(request);
  const normalizedRequestStatus = String(request?.status || '').toLowerCase();
  const isReplacementRequested = normalizedRequestStatus === 'rejected';
  const canRemoveRequest = Boolean(request?.id);
  const latestReplacementNote = ['rejected', 'suspended'].includes(normalizedRequestStatus)
    ? String(request?.latest_replacement_note || request?.rejection_reason || '').trim()
    : '';

  const mapScanFields = (scanData = {}) => ({
    full_name: scanData?.full_name || scanData?.fullName || scanData?.name || null,
    date_of_birth: scanData?.date_of_birth || scanData?.dateOfBirth || scanData?.customer_dob || null,
    document_number:
      scanData?.document_number ||
      scanData?.id_number ||
      scanData?.idNumber ||
      scanData?.licence_number ||
      scanData?.license_number ||
      null,
    licence_number: scanData?.licence_number || scanData?.license_number || null,
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
    const sharedFields = [
      { key: 'full_name', label: tr('Full name', 'Nom complet'), type: 'text' },
      { key: 'document_number', label: tr('Document number', 'Numéro du document'), type: 'text' },
      { key: 'date_of_birth', label: tr('Date of birth', 'Date de naissance'), type: 'date' },
      { key: 'nationality', label: tr('Nationality', 'Nationalité'), type: 'text' },
    ];

    if (verificationType === 'driver_license') {
      return [
        ...sharedFields,
        { key: 'licence_number', label: tr('License number', 'Numéro du permis'), type: 'text' },
        { key: 'expiry_date', label: tr('Expiry date', 'Date d’expiration'), type: 'date' },
      ];
    }

    return [
      ...sharedFields,
      { key: 'id_number', label: tr('ID number', 'Numéro d’identité'), type: 'text' },
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
      await VerificationService.updateProfileFromVerificationScan({
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
    onUploaded?.(result);
    return result;
  };

  const submitFile = async (file, submissionSource = 'manual_upload') => {
    if (!file || disabled) return;

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
    if (disabled || isUploading) return;
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
    const file = event.dataTransfer?.files?.[0];
    await submitFile(file, 'drag_drop_upload');
  };

  const handleScanComplete = async (scanData, scannedFile) => {
    if (!scannedFile || disabled) return;

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
    if (!request?.id || disabled || isRemoving) return;

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
      setPendingReview(null);
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
      setIsUploading(true);
      await finalizeSubmission({
        file: pendingReview.file,
        submissionSource: pendingReview.submissionSource,
        scanData: pendingReview.scanData,
        extractedFields: pendingReview.fields,
        ocrAttempted: true,
        ocrSucceeded: true,
      });
      toast.success(
        tr(
          'Scanned document submitted for review.',
          'Document scanné envoyé pour vérification.'
        )
      );
      setPendingReview(null);
    } catch (error) {
      toast.error(error.message || tr('Unable to submit scanned document.', 'Impossible de soumettre le document scanné.'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
    <div
      className={`w-full overflow-hidden rounded-[24px] border bg-white p-4 shadow-sm transition hover:border-violet-100 hover:shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${
        dragActive
          ? 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-100'
          : 'border-slate-200'
      }`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          {request?.file_url ? (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border border-slate-200 bg-slate-50">
              {previewKind === 'image' ? (
                <img
                  src={request.file_url}
                  alt={request?.file_name || getVerificationTypeLabel(verificationType, language)}
                  className="h-full w-full object-cover"
                />
              ) : previewKind === 'pdf' ? (
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
            </div>
          ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <FileText className="h-4 w-4" />
            </span>
            <p className="min-w-0 break-words text-sm font-bold text-slate-950">{getVerificationTypeLabel(verificationType, language)}</p>
            <VerificationStatusBadge status={request?.status || 'missing'} />
          </div>
          <p className="mt-1 break-words text-xs font-medium text-slate-500 sm:truncate">
            {request?.file_name || tr('No document uploaded yet.', 'Aucun document téléversé.')}
          </p>
          {request ? (
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {request?.submission_source_label || tr('Added manually', 'Ajouté manuellement')}
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
          {request?.file_url && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Eye className="mr-1 inline h-3.5 w-3.5" />
              {tr('View', 'Voir')}
            </button>
          )}
          {canRemoveRequest ? (
            <button
              type="button"
              disabled={disabled || isUploading || isRemoving}
              onClick={handleRemove}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />
              {isRemoving ? tr('Removing...', 'Suppression...') : tr('Remove', 'Supprimer')}
            </button>
          ) : null}
          {enableScan && (
            <button
              type="button"
              disabled={disabled || isUploading}
              onClick={() => setScanOpen(true)}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanLine className="mr-1 inline h-3.5 w-3.5" />
              {isReplacementRequested ? tr('Scan replacement', 'Scanner le remplacement') : tr('Scan', 'Scanner')}
            </button>
          )}
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-w-0 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-center text-xs font-bold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="mr-1 inline h-3.5 w-3.5" />
            {isUploading
              ? tr('Uploading...', 'Téléversement...')
              : isReplacementRequested
                ? tr('Upload replacement', 'Téléverser le remplacement')
                : request
                  ? tr('Replace', 'Remplacer')
                  : tr('Upload', 'Téléverser')}
          </button>
        </div>
      </div>
      {!request?.file_url ? (
        <p className={`mt-3 text-xs font-medium ${dragActive ? 'text-violet-700' : 'text-slate-500'}`}>
          {tr(
            'Click upload or drag and drop a document here.',
            'Cliquez sur téléverser ou glissez-déposez un document ici.'
          )}
        </p>
      ) : null}
      {pendingReview ? (
        <div className="mt-4 rounded-[22px] border border-violet-200 bg-violet-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                {tr('Review scanned details', 'Vérifiez les détails scannés')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {tr(
                  'Check the extracted fields before sending this document for approval.',
                  'Vérifiez les champs extraits avant d’envoyer ce document pour approbation.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isUploading}
              onClick={handleSubmitReviewedScan}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? tr('Submitting...', 'Envoi...') : tr('Submit for review', 'Envoyer pour vérification')}
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => setPendingReview(null)}
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
    {previewOpen && request?.file_url ? (
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
                {request?.file_name || tr('Submitted document', 'Document soumis')}
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
            {previewKind === 'image' ? (
              <div className="flex h-full items-center justify-center overflow-auto rounded-[24px] bg-white p-3">
                <img
                  src={request.file_url}
                  alt={request?.file_name || getVerificationTypeLabel(verificationType, language)}
                  className="max-h-full w-auto max-w-full rounded-2xl object-contain"
                />
              </div>
            ) : previewKind === 'pdf' ? (
              <iframe
                src={request.file_url}
                title={request?.file_name || getVerificationTypeLabel(verificationType, language)}
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
};

export default VerificationUploadField;
