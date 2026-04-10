import React from 'react';
import { getVerificationBadgeClass, getVerificationLabel } from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const VerificationStatusBadge = ({ status = 'pending', className = '' }) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] ${getVerificationBadgeClass(status)} ${className}`}>
      {getVerificationLabel(status, language)}
    </span>
  );
};

export default VerificationStatusBadge;
