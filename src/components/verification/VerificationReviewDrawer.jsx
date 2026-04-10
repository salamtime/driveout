import React, { useEffect, useState } from 'react';
import { X, ExternalLink, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import VerificationStatusBadge from './VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const VerificationReviewDrawer = ({ request, onClose, onUpdated }) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState(request?.expires_at?.slice(0, 10) || '');
  const [decision, setDecision] = useState('approved');
  const [savingStatus, setSavingStatus] = useState('');

  useEffect(() => {
    setReason('');
    setExpiresAt(request?.expires_at?.slice(0, 10) || '');
    setDecision('approved');
  }, [request?.id, request?.expires_at]);

  if (!request) return null;

  const updateStatus = async () => {
    const status = decision;
    if (['rejected', 'suspended'].includes(status) && !reason.trim()) {
      toast.error(tr('Add a review reason first.', 'Ajoutez d’abord un motif de révision.'));
      return;
    }

    try {
      setSavingStatus(status);
      const result = await VerificationService.updateVerificationStatus({
        id: request.id,
        status,
        rejectionReason: ['rejected', 'suspended'].includes(status) ? reason.trim() : '',
        expiresAt: expiresAt || null,
      });
      toast.success(tr('Verification updated.', 'Vérification mise à jour.'));
      onUpdated?.(result);
    } catch (error) {
      toast.error(error.message || tr('Unable to update verification.', 'Impossible de mettre à jour la vérification.'));
    } finally {
      setSavingStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
                {tr('Verification review', 'Révision de vérification')}
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {getVerificationTypeLabel(request.verification_type, language)}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-950">{request.file_name || tr('Submitted document', 'Document soumis')}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{request.file_mime_type || 'File'} · {formatDate(request.created_at)}</p>
              </div>
              <VerificationStatusBadge status={request.status} />
            </div>
            {request.file_url && (
              <button
                type="button"
                onClick={() => window.open(request.file_url, '_blank', 'noopener,noreferrer')}
                className="mt-4 inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-violet-200 hover:text-violet-700"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {tr('Open document', 'Ouvrir le document')}
              </button>
            )}
          </div>

          <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Subject', 'Sujet')}</span>
              <span className="truncate text-right font-semibold text-slate-950">{request.entity_type} · {request.entity_id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Owner', 'Propriétaire')}</span>
              <span className="truncate text-right font-semibold text-slate-950">{request.owner_user_id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Expiry', 'Expiration')}</span>
              <span className="font-semibold text-slate-950">{formatDate(request.expires_at)}</span>
            </div>
          </div>

          {request.verification_type === 'vehicle_insurance' && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Confirm expiry date', 'Confirmer expiration')}</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              />
            </label>
          )}

          <label className="block rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Decision', 'Décision')}</span>
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            >
              <option value="approved">{tr('Approve as verified', 'Approuver comme vérifié')}</option>
              <option value="rejected">{tr('Reject and request replacement', 'Rejeter et demander remplacement')}</option>
              <option value="suspended">{tr('Suspend verification', 'Suspendre la vérification')}</option>
              <option value="expired">{tr('Mark as expired', 'Marquer comme expiré')}</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Review note', 'Note de révision')}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-[22px] border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              placeholder={tr('Required for rejection or suspension.', 'Requis en cas de rejet ou suspension.')}
            />
          </label>

          <button
            type="button"
            disabled={!!savingStatus}
            onClick={updateStatus}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_18px_34px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {savingStatus ? tr('Saving decision...', 'Enregistrement...') : tr('Save review decision', 'Enregistrer la décision')}
          </button>
        </div>
      </aside>
    </div>
  );
};

export default VerificationReviewDrawer;
