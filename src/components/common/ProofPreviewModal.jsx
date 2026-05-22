import React from 'react';
import { ReceiptText, X } from 'lucide-react';

const isImageUrl = (value) =>
  Boolean(value && /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(String(value)));

const ProofPreviewModal = ({
  open = false,
  url = '',
  title = 'Payment proof',
  subtitle = '',
  onClose,
  tr = (en) => en,
}) => {
  if (!open || !url) return null;

  const isImage = isImageUrl(url);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              <ReceiptText className="h-4 w-4" />
              {tr('Payment proof preview', 'Aperçu preuve de paiement')}
            </p>
            <h3 className="mt-2 truncate text-xl font-black tracking-tight text-slate-950">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            aria-label={tr('Close preview', "Fermer l'aperçu")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-slate-100 p-3 sm:p-4">
          <div className="flex h-[72vh] items-center justify-center overflow-hidden rounded-[1.2rem] border border-slate-200 bg-white">
            {isImage ? (
              <img
                src={url}
                alt={tr('Payment proof receipt', 'Reçu de preuve de paiement')}
                className="h-full w-full object-contain"
              />
            ) : (
              <iframe
                src={url}
                title={title}
                className="h-full w-full border-0 bg-white"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProofPreviewModal;
