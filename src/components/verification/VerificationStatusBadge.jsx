import React from 'react';
import { AlertTriangle, Archive, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { getVerificationBadgeClass, getVerificationLabel } from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const VerificationStatusBadge = ({ status = 'pending', className = '' }) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const normalizedStatus = String(status || 'pending').trim().toLowerCase();

  const StatusIcon =
    normalizedStatus === 'approved'
      ? CheckCircle2
      : normalizedStatus === 'rejected'
        ? XCircle
        : normalizedStatus === 'suspended'
          ? AlertTriangle
          : normalizedStatus === 'expired'
            ? AlertTriangle
            : normalizedStatus === 'archived'
              ? Archive
              : Clock3;

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] ${getVerificationBadgeClass(status)} ${className}`}>
      <StatusIcon className="mr-1.5 h-3.5 w-3.5" />
      {getVerificationLabel(status, language)}
    </span>
  );
};

export default VerificationStatusBadge;
