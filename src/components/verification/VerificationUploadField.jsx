import React, { useRef, useState } from 'react';
import { UploadCloud, Eye, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import VerificationStatusBadge from './VerificationStatusBadge';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';
import VerificationService from '../../services/VerificationService';
import { useTranslation } from 'react-i18next';

const VerificationUploadField = ({
  entityType,
  entityId,
  ownerUserId,
  verificationType,
  request,
  requiresExpiry = false,
  disabled = false,
  onUploaded,
}) => {
  const inputRef = useRef(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [isUploading, setIsUploading] = useState(false);
  const [expiresAt, setExpiresAt] = useState(request?.expires_at?.slice(0, 10) || '');

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;

    if (requiresExpiry && !expiresAt) {
      toast.error(tr('Add the expiry date before uploading.', 'Ajoutez la date d’expiration avant le téléversement.'));
      return;
    }

    try {
      setIsUploading(true);
      const result = await VerificationService.uploadVerificationDocument({
        entityType,
        entityId,
        ownerUserId,
        verificationType,
        file,
        expiresAt: expiresAt || null,
      });
      toast.success(tr('Document submitted for review.', 'Document envoyé pour vérification.'));
      onUploaded?.(result);
    } catch (error) {
      toast.error(error.message || tr('Unable to upload document.', 'Impossible de téléverser le document.'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-100 hover:shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <FileText className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold text-slate-950">{getVerificationTypeLabel(verificationType, language)}</p>
            <VerificationStatusBadge status={request?.status || 'missing'} />
          </div>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {request?.file_name || tr('No document uploaded yet.', 'Aucun document téléversé.')}
          </p>
          {request?.rejection_reason && (
            <p className="mt-2 text-xs font-semibold text-rose-600">{request.rejection_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          {request?.file_url && (
            <button
              type="button"
              onClick={() => window.open(request.file_url, '_blank', 'noopener,noreferrer')}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Eye className="mr-1 inline h-3.5 w-3.5" />
              {tr('View', 'Voir')}
            </button>
          )}
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="mr-1 inline h-3.5 w-3.5" />
            {isUploading ? tr('Uploading...', 'Téléversement...') : request ? tr('Replace', 'Remplacer') : tr('Upload', 'Téléverser')}
          </button>
        </div>
      </div>
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
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export default VerificationUploadField;
