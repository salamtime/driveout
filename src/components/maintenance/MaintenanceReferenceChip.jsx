import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import i18n from '../../i18n';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';

const copyTextToClipboard = async (value) => {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error('Nothing to copy');
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};

const MaintenanceReferenceChip = ({
  maintenanceId,
  showPrefix = false,
  size = 'sm',
  className = '',
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef(null);

  const reference = formatMaintenanceReference(maintenanceId);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(reference);
      setCopied(true);
      toast.success(tr('Maintenance reference copied', 'Référence de maintenance copiée'));
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1400);
    } catch {
      toast.error(tr('Could not copy maintenance reference', 'Impossible de copier la référence de maintenance'));
    }
  }, [reference, tr]);

  if (!reference) return null;

  const sizeClass = size === 'xs'
    ? 'px-2.5 py-1 text-xs'
    : 'px-3 py-1 text-sm';

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 active:scale-[0.99] ${sizeClass} ${className}`.trim()}
      title={tr('Tap to copy maintenance reference', 'Touchez pour copier la référence de maintenance')}
    >
      <span>{showPrefix ? `${tr('Ref:', 'Réf. :')} ${reference}` : reference}</span>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export default MaintenanceReferenceChip;
