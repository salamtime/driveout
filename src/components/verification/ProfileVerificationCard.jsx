import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import VerificationUploadField from './VerificationUploadField';
import VerificationStatusBadge from './VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import {
  PROFILE_REQUIRED_VERIFICATIONS,
  buildEntityVerificationSummary,
  getVerificationTypeLabel,
} from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const ProfileVerificationCard = ({ profile }) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const profileId = profile?.id;
  const summary = useMemo(() => buildEntityVerificationSummary(requests, 'user'), [requests]);

  const loadRequests = useCallback(async () => {
    if (!profileId) return;
    try {
      setLoading(true);
      const result = await VerificationService.getEntityVerificationSummary('user', profileId);
      setRequests(result.requests || []);
    } catch (error) {
      console.warn('Unable to load profile verification summary:', error.message);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const latestByType = summary.latestByType || {};

  return (
    <div className="mt-5 rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_72%)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
            {tr('Verification', 'Vérification')}
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            {tr('Profile verification', 'Vérification du profil')}
          </h3>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
            {tr(
              'Upload the required owner documents once. Approved documents unlock trusted owner workflows.',
              'Téléversez les documents propriétaire requis une seule fois. Les documents approuvés débloquent les opérations vérifiées.'
            )}
          </p>
        </div>
        <VerificationStatusBadge status={summary.status} />
      </div>

      <div className="mt-4 grid gap-3">
        {PROFILE_REQUIRED_VERIFICATIONS.map((verificationType) => (
          <VerificationUploadField
            key={verificationType}
            entityType="user"
            entityId={profileId}
            ownerUserId={profileId}
            verificationType={verificationType}
            request={latestByType[verificationType]}
            disabled={!profileId || loading}
            onUploaded={loadRequests}
          />
        ))}
      </div>

      {!summary.complete && (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {tr(
            `${getVerificationTypeLabel('profile_id', language)} must be verified before full owner activation.`,
            `${getVerificationTypeLabel('profile_id', language)} doit être vérifié avant l’activation complète.`
          )}
        </p>
      )}
    </div>
  );
};

export default ProfileVerificationCard;
